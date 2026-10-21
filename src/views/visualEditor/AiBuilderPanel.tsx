'use client'

import React, { useEffect, useId, useRef, useState } from 'react'

import type { SectionNode } from '@/lib/sectionTree'
import { writingText } from '@/features/ai/streamParse'

import {
  addOutlineItem,
  AI_LIMITS,
  AI_PROVIDER_LABELS,
  AI_QUICK_STARTS,
  AiBuilderError,
  addSavedPrompt,
  deleteSavedPrompt,
  fetchAiStatus,
  fetchTemplateExamples,
  loadSavedPrompts,
  progressText,
  storeSavedPrompts,
  trimHistory,
  usageText,
  usageWarning,
  type AiHistoryEntry,
  type AiTemplateExample,
  type AiUsage,
  type SavedPrompt,
  buildAiRequest,
  connectedProviders,
  effectiveMode,
  INTEGRATIONS_HREF,
  moveOutlineItem,
  normaliseBuild,
  normalisePlan,
  pickProvider,
  postAiBuilder,
  removeOutlineItem,
  updateOutlineItem,
  validateBrief,
  validateOutline,
  type AiAnswer,
  type AiBuildResult,
  type AiBuilderRequest,
  type AiMode,
  type AiOutlineItem,
  type AiPlanResult,
  type AiProvider,
  type AiProviders,
} from './aiBuilderState'

/**
 * "Build with AI" panel, shown in the dialog opened from the Elements tab. Walks a person through brief -> questions or outline -> review and insert.
 * The server does the work with the admin's own API key; this panel only collects input, shows progress,
 * and hands the finished sections back to the editor, which inserts them with fresh ids as one undo step.
 * The brief and examples live in component state only and are never stored in the browser.
 */

export type AiBuilderPanelProps = {
  pageTitle: string
  /** The top-level section selected on the canvas, or null. Target of "Edit selected section". */
  selectedSection: SectionNode | null
  /** Appends the sections to the end of the page (one undo step). Returns false when the editor refused. */
  onInsertAtEnd: (sections: SectionNode[]) => boolean
  /** Replaces the section with this _id (one undo step). Returns false when the selection moved or it is locked. */
  onReplaceSelected: (sections: SectionNode[], sectionId: string | undefined) => boolean
  /** The dialog has its own title, so the panel's heading is hidden there. Defaults to true. */
  showTitle?: boolean
}

type Step = 'brief' | 'questions' | 'outline' | 'result'
type ProviderLoad = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; providers: AiProviders }
type BuiltResult = AiBuildResult & { mode: AiMode; selectionId?: string }

const newId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const MODE_OPTIONS: { value: AiMode; label: string }[] = [
  { value: 'section', label: 'New section' },
  { value: 'page', label: 'Whole page content' },
  { value: 'edit', label: 'Edit selected section' },
]

const TIP_TEXT =
  "Add examples for much better results: describe a section you like, paste its text, or say 'like a pricing table with 3 plans, friendly tone, dark background'. Mention audience, tone, colours and any links or buttons you want."

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

function describeResult(result: AiBuildResult): string {
  return `Built ${result.sections.length} ${plural(result.sections.length, 'section', 'sections')}.`
}

function messageOf(err: unknown): string {
  if (err instanceof AiBuilderError) return err.message
  return 'Could not reach the AI builder. Check your connection and try again.'
}

export const AiBuilderPanel: React.FC<AiBuilderPanelProps> = ({ pageTitle, selectedSection, onInsertAtEnd, onReplaceSelected, showTitle = true }) => {
  const ids = useId()
  const [load, setLoad] = useState<ProviderLoad>({ status: 'loading' })
  const [loadKey, setLoadKey] = useState(0)
  const [chosen, setChosen] = useState<AiProvider>('claude')
  const [modeChoice, setModeChoice] = useState<AiMode>('section')
  const [brief, setBrief] = useState('')
  const [examples, setExamples] = useState<string[]>([])
  const [tipOpen, setTipOpen] = useState(false)
  const [step, setStep] = useState<Step>('brief')
  const [questions, setQuestions] = useState<string[]>([])
  const [answerInputs, setAnswerInputs] = useState<string[]>([])
  const [answerLog, setAnswerLog] = useState<AiAnswer[]>([])
  const [outline, setOutline] = useState<AiOutlineItem[]>([])
  const [built, setBuilt] = useState<BuiltResult | null>(null)
  const [busy, setBusy] = useState<'plan' | 'build' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inserted, setInserted] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [chars, setChars] = useState(0)
  const [history, setHistory] = useState<AiHistoryEntry[]>([])
  const [prevBuilt, setPrevBuilt] = useState<BuiltResult | null>(null)
  const [refineText, setRefineText] = useState('')
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>(() => loadSavedPrompts())
  const [saveName, setSaveName] = useState('')
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [templateExamples, setTemplateExamples] = useState<AiTemplateExample[] | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

  useEffect(() => {
    const controller = new AbortController()
    fetchAiStatus(controller.signal).then(
      ({ providers, usage: nextUsage }) => {
        setUsage(nextUsage)
        setLoad({ status: 'ready', providers })
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        setLoad({ status: 'error', message: messageOf(err) })
      },
    )
    return () => controller.abort()
  }, [loadKey])

  useEffect(() => () => abortRef.current?.abort(), [])

  const connected = load.status === 'ready' ? connectedProviders(load.providers) : []
  const provider = pickProvider(chosen, connected)
  const mode = effectiveMode(modeChoice, selectedSection !== null)
  const briefError = validateBrief(brief)
  const outlineError = validateOutline(outline)
  const tipId = `${ids}-tip`
  const briefId = `${ids}-brief`
  const modeHintId = `${ids}-mode-hint`
  const stepNumber = step === 'brief' ? 1 : step === 'result' ? 3 : 2

  const makeRequest = (p: AiProvider, action: 'plan' | 'build', answers: AiAnswer[], items?: AiOutlineItem[]): AiBuilderRequest =>
    buildAiRequest(action, {
      provider: p,
      mode,
      brief,
      examples,
      answers,
      outline: items,
      selection: selectedSection ?? undefined,
      pageTitle,
    })

  /** One call at a time. Cancel (or unmount) aborts it; an aborted call sets no error. */
  const callApi = async <T,>(body: AiBuilderRequest, parse: (data: unknown) => T): Promise<T | null> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setElapsed(0)
    setChars(0)
    setBusy(body.action)
    setError(null)
    try {
      return parse(await postAiBuilder(body, controller.signal, setChars))
    } catch (err) {
      if (!controller.signal.aborted) setError(messageOf(err))
      return null
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setBusy(null)
      }
    }
  }

  const cancel = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(null)
  }

  const applyPlan = (result: AiPlanResult, log: AiAnswer[]) => {
    setAnswerLog(log)
    if (result.kind === 'questions') {
      setQuestions(result.questions)
      setAnswerInputs(result.questions.map(() => ''))
      setStep('questions')
    } else {
      setOutline(result.outline)
      setStep('outline')
    }
  }

  const planIt = async () => {
    if (!provider || briefError) return
    const result = await callApi(makeRequest(provider, 'plan', []), normalisePlan)
    if (result) applyPlan(result, [])
  }

  const continueQuestions = async () => {
    if (!provider) return
    const pairs = questions.map((q, i) => ({ q, a: answerInputs[i] ?? '' }))
    const log = [...answerLog, ...pairs]
    const result = await callApi(makeRequest(provider, 'plan', log), normalisePlan)
    if (result) applyPlan(result, log)
  }

  /** Builds the sections. Pass the outline to build from it, or undefined to build from the brief alone. */
  const runBuild = async (items: AiOutlineItem[] | undefined) => {
    if (!provider) return
    const selectionId = mode === 'edit' ? selectedSection?._id : undefined
    const result = await callApi(makeRequest(provider, 'build', answerLog, items), normaliseBuild)
    if (result) {
      setBuilt({ ...result, mode, selectionId })
      setPrevBuilt(null)
      setHistory(trimHistory([{ role: 'user', text: brief }, { role: 'assistant', text: describeResult(result) }]))
      setInserted(false)
      setStep('result')
    }
  }

  /** Sends the previous result plus the chat history so the AI changes it rather than starting over. */
  const refine = async () => {
    const text = refineText.trim()
    if (!built || !provider || !text || inserted) return
    const body = buildAiRequest('build', {
      provider,
      mode: built.mode,
      brief: text,
      selection: selectedSection ?? undefined,
      pageTitle,
      history,
      current: built.sections,
    })
    const result = await callApi(body, normaliseBuild)
    if (result) {
      setPrevBuilt(built)
      setBuilt({ ...result, mode: built.mode, selectionId: built.selectionId })
      setHistory(trimHistory([...history, { role: 'user', text }, { role: 'assistant', text: describeResult(result) }]))
      setRefineText('')
    }
  }

  const goBackOne = () => {
    if (!prevBuilt) return
    setBuilt(prevBuilt)
    setPrevBuilt(null)
    setHistory(history.slice(0, -2))
    setError(null)
  }

  const saveCurrentPrompt = () => {
    const next = addSavedPrompt(savedPrompts, saveName, brief, newId())
    setSavedPrompts(next)
    setSaveNote(storeSavedPrompts(next) ? 'Saved.' : 'Saved for this visit only: your browser blocked storage.')
    setSaveName('')
  }

  const removeSavedPrompt = (id: string) => {
    const next = deleteSavedPrompt(savedPrompts, id)
    setSavedPrompts(next)
    storeSavedPrompts(next)
  }

  const toggleTemplates = () => {
    const open = !templatesOpen
    setTemplatesOpen(open)
    if (open && templateExamples === null) {
      void fetchTemplateExamples().then(setTemplateExamples)
    }
  }

  const addTemplateExample = (text: string) => {
    if (examples.length >= AI_LIMITS.examples) return
    setExamples([...examples, text])
  }

  const insertBuilt = () => {
    if (!built || inserted) return
    const ok = built.mode === 'edit' ? onReplaceSelected(built.sections, built.selectionId) : onInsertAtEnd(built.sections)
    if (ok) {
      setInserted(true)
      setError(null)
    } else {
      setError('The editor did not insert these sections. Check the notice on the canvas.')
    }
  }

  const startAgain = () => {
    setStep('brief')
    setBrief('')
    setExamples([])
    setQuestions([])
    setAnswerInputs([])
    setAnswerLog([])
    setOutline([])
    setBuilt(null)
    setPrevBuilt(null)
    setHistory([])
    setRefineText('')
    setInserted(false)
    setError(null)
  }

  const retryLoad = () => {
    setLoad({ status: 'loading' })
    setLoadKey((key) => key + 1)
  }

  const briefStep = (
    <>
      <div className="ve-ai__group">
        <label className="ve-ai__label">
          <span>Model</span>
          <select id={`${ids}-model`} className="ve-ai__select" value={provider ?? ''} onChange={(event) => setChosen(event.target.value as AiProvider)}>
            {connected.map((p) => (
              <option key={p} value={p}>
                {AI_PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="ve-ai__group">
        <legend className="ve-ai__legend">What should it make?</legend>
        <div className="ve-ai__segments" aria-describedby={modeHintId}>
          {MODE_OPTIONS.map((option) => (
            <label key={option.value} className="ve-ai__segment">
              <input
                type="radio"
                name={`${ids}-mode`}
                value={option.value}
                checked={mode === option.value}
                disabled={option.value === 'edit' && selectedSection === null}
                onChange={() => setModeChoice(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <p id={modeHintId} className="ve-ai__hint">
          {selectedSection
            ? 'Edit selected section replaces the section you picked on the canvas.'
            : 'Select a section on the canvas to enable Edit selected section.'}
        </p>
      </fieldset>

      <div className="ve-ai__group">
        <div className="ve-ai__row" onKeyDown={(event) => {
          if (event.key !== 'Escape' || !tipOpen) return
          setTipOpen(false)
        }}>
          <label htmlFor={briefId} className="ve-ai__legend">
            Describe what you want
          </label>
          <button
            type="button"
            className="ve-ai__info"
            aria-label="Tips for better results"
            aria-expanded={tipOpen}
            aria-controls={tipId}
            onClick={() => setTipOpen((open) => !open)}
          >
            ?
          </button>
        </div>
        {tipOpen && (
          <div id={tipId} className="ve-ai__tip">
            {TIP_TEXT}
          </div>
        )}
        <textarea
          id={briefId}
          className="ve-ai__textarea"
          value={brief}
          maxLength={AI_LIMITS.brief}
          placeholder="e.g. A hero for a bakery: warm headline, one short paragraph and two buttons, Order now and See menu."
          onChange={(event) => setBrief(event.target.value)}
        />
        <span className="ve-ai__counter">
          {brief.length} / {AI_LIMITS.brief}
        </span>
      </div>

      <div className="ve-ai__group">
        <div className="ve-ai__save">
          <label htmlFor={`${ids}-save`} className="ve-ai__note">
            Save this brief as
          </label>
          <input
            id={`${ids}-save`}
            type="text"
            className="ve-ai__input"
            value={saveName}
            maxLength={60}
            placeholder="Name, e.g. Bakery hero"
            onChange={(event) => setSaveName(event.target.value)}
          />
          <button type="button" className="ve-ai__btn ve-ai__btn--small" disabled={!saveName.trim() || !brief.trim()} onClick={saveCurrentPrompt}>
            Save
          </button>
        </div>
        {saveNote && (
          <p className="ve-ai__note" role="status">
            {saveNote}
          </p>
        )}
        {savedPrompts.length > 0 && (
          <ul className="ve-ai__saved" aria-label="Saved prompts">
            {savedPrompts.map((item) => (
              <li key={item.id} className="ve-ai__saved-item">
                <button type="button" className="ve-ai__chip" title={item.brief} onClick={() => setBrief(item.brief)}>
                  {item.name}
                </button>
                <button
                  type="button"
                  className="ve-ai__btn ve-ai__btn--small"
                  aria-label={`Delete saved prompt ${item.name}`}
                  onClick={() => removeSavedPrompt(item.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ve-ai__group">
        <span className="ve-ai__note">Quick starts</span>
        <div className="ve-ai__chips" role="group" aria-label="Quick starts">
          {AI_QUICK_STARTS.map((text) => (
            <button key={text} type="button" className="ve-ai__chip" onClick={() => setBrief(text)}>
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="ve-ai__examples">
        <span className="ve-ai__label">Examples (optional)</span>
        {examples.map((example, i) => (
          <div className="ve-ai__example" key={i}>
            <div className="ve-ai__row">
              <label htmlFor={`${ids}-ex-${i}`} className="ve-ai__note">
                Example {i + 1}
              </label>
              <button
                type="button"
                className="ve-ai__btn ve-ai__btn--small"
                aria-label={`Remove example ${i + 1}`}
                onClick={() => setExamples(examples.filter((_item, index) => index !== i))}
              >
                Remove
              </button>
            </div>
            <textarea
              id={`${ids}-ex-${i}`}
              className="ve-ai__textarea"
              value={example}
              maxLength={AI_LIMITS.example}
              onChange={(event) => setExamples(examples.map((item, index) => (index === i ? event.target.value : item)))}
            />
          </div>
        ))}
        <div className="ve-ai__actions">
          <button
            type="button"
            className="ve-ai__btn ve-ai__btn--small"
            disabled={examples.length >= AI_LIMITS.examples}
            onClick={() => setExamples([...examples, ''])}
          >
            + Add example
          </button>
          <button type="button" className="ve-ai__btn ve-ai__btn--small" aria-expanded={templatesOpen} onClick={toggleTemplates}>
            Use a saved template as an example
          </button>
          {examples.length >= AI_LIMITS.examples && <span className="ve-ai__note">Up to {AI_LIMITS.examples} examples.</span>}
        </div>
        {templatesOpen && (
          <div className="ve-ai__chips" role="group" aria-label="Saved templates">
            {templateExamples === null && <span className="ve-ai__note">Loading templates...</span>}
            {templateExamples?.length === 0 && <span className="ve-ai__note">No saved templates yet.</span>}
            {templateExamples?.map((item) => (
              <button key={item.id} type="button" className="ve-ai__chip" disabled={examples.length >= AI_LIMITS.examples} onClick={() => addTemplateExample(item.text)}>
                {item.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ve-ai__actions">
        <button type="button" className="ve-ai__btn ve-ai__btn--primary" disabled={!provider || briefError !== null} onClick={planIt}>
          Plan it
        </button>
        <button type="button" className="ve-ai__link" disabled={!provider || briefError !== null} onClick={() => runBuild(undefined)}>
          Skip planning, build now
        </button>
      </div>
      {brief.length > 0 && briefError && <p className="ve-ai__note">{briefError}</p>}
    </>
  )

  const questionsStep = (
    <>
      <p className="ve-ai__hint">A few questions so the AI gets it right. Short answers are fine.</p>
      {questions.map((question, i) => (
        <div className="ve-ai__example" key={i}>
          <label htmlFor={`${ids}-q-${i}`} className="ve-ai__label">
            {question}
          </label>
          <input
            id={`${ids}-q-${i}`}
            type="text"
            className="ve-ai__input"
            value={answerInputs[i] ?? ''}
            maxLength={AI_LIMITS.answer}
            onChange={(event) => setAnswerInputs(answerInputs.map((item, index) => (index === i ? event.target.value : item)))}
          />
        </div>
      ))}
      <div className="ve-ai__actions">
        <button type="button" className="ve-ai__btn ve-ai__btn--primary" onClick={continueQuestions}>
          Continue
        </button>
        <button type="button" className="ve-ai__btn" onClick={() => setStep('brief')}>
          Back
        </button>
      </div>
      <button type="button" className="ve-ai__link" disabled={!provider} onClick={() => runBuild(undefined)}>
        Skip planning, build now
      </button>
    </>
  )

  const outlineStep = (
    <>
      <p className="ve-ai__hint">Edit the sections below. Build makes one section per item, in this order.</p>
      <ol className="ve-ai__list" aria-label="Outline">
        {outline.map((item, i) => (
          <li className="ve-ai__item" key={i}>
            <div className="ve-ai__item-head">
              <span>Section {i + 1}</span>
              <span className="ve-ai__actions">
                <button
                  type="button"
                  className="ve-ai__btn ve-ai__btn--small"
                  aria-label={`Move section ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => setOutline(moveOutlineItem(outline, i, -1))}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="ve-ai__btn ve-ai__btn--small"
                  aria-label={`Move section ${i + 1} down`}
                  disabled={i === outline.length - 1}
                  onClick={() => setOutline(moveOutlineItem(outline, i, 1))}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="ve-ai__btn ve-ai__btn--small"
                  aria-label={`Remove section ${i + 1}`}
                  onClick={() => setOutline(removeOutlineItem(outline, i))}
                >
                  Remove
                </button>
              </span>
            </div>
            <label className="ve-ai__label">
              <span>Title</span>
              <input
                type="text"
                className="ve-ai__input"
                value={item.title}
                maxLength={AI_LIMITS.outlineTitle}
                onChange={(event) => setOutline(updateOutlineItem(outline, i, { title: event.target.value }))}
              />
            </label>
            <label className="ve-ai__label">
              <span>Summary</span>
              <textarea
                className="ve-ai__textarea"
                value={item.summary}
                maxLength={AI_LIMITS.outlineSummary}
                onChange={(event) => setOutline(updateOutlineItem(outline, i, { summary: event.target.value }))}
              />
            </label>
          </li>
        ))}
      </ol>
      <div className="ve-ai__actions">
        <button type="button" className="ve-ai__btn" disabled={outline.length >= AI_LIMITS.outlineItems} onClick={() => setOutline(addOutlineItem(outline))}>
          + Add section
        </button>
      </div>
      {outlineError && <p className="ve-ai__note">{outlineError}</p>}
      <div className="ve-ai__actions">
        <button type="button" className="ve-ai__btn ve-ai__btn--primary" disabled={outlineError !== null} onClick={() => runBuild(outline)}>
          Build
        </button>
        <button type="button" className="ve-ai__btn" onClick={() => setStep('brief')}>
          Back to brief
        </button>
      </div>
    </>
  )

  const resultStep = built && (
    <>
      <p className="ve-ai__success" role="status">
        {inserted
          ? 'Inserted. Undo reverses it.'
          : `${built.sections.length} ${plural(built.sections.length, 'section', 'sections')} ready${built.mode === 'edit' ? ' to replace the selected section' : ''}.`}
      </p>
      {built.warnings.length > 0 && (
        <details className="ve-ai__warnings">
          <summary>
            Warnings ({built.warnings.length})
          </summary>
          <ul>
            {built.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {inserted && built.mediaPlaceholders.length > 0 && (
        <div className="ve-ai__media">
          <p className="ve-ai__label">Add images for:</p>
          <ul>
            {built.mediaPlaceholders.map((item, i) => (
              <li key={i}>{item.alt}</li>
            ))}
          </ul>
        </div>
      )}
      {!inserted && (
        <div className="ve-ai__refine">
          <label htmlFor={`${ids}-refine`} className="ve-ai__label">
            Refine
          </label>
          <input
            id={`${ids}-refine`}
            type="text"
            className="ve-ai__input"
            value={refineText}
            maxLength={AI_LIMITS.answer}
            placeholder="e.g. make the heading bigger, darker background"
            onChange={(event) => setRefineText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void refine()
              }
            }}
          />
          <div className="ve-ai__actions">
            <button type="button" className="ve-ai__btn" disabled={!provider || !refineText.trim()} onClick={refine}>
              Refine
            </button>
            {prevBuilt && (
              <button type="button" className="ve-ai__btn" onClick={goBackOne}>
                Back to previous version
              </button>
            )}
          </div>
        </div>
      )}
      <div className="ve-ai__actions">
        {!inserted && (
          <button type="button" className="ve-ai__btn ve-ai__btn--primary" onClick={insertBuilt}>
            {built.mode === 'edit' ? 'Replace selected section' : 'Insert at end of page'}
          </button>
        )}
        {!inserted && (
          <button type="button" className="ve-ai__btn" disabled={!provider} onClick={() => runBuild(outline.length ? outline : undefined)}>
            Try again
          </button>
        )}
        {!inserted && outline.length > 0 && (
          <button type="button" className="ve-ai__btn" onClick={() => setStep('outline')}>
            Back to outline
          </button>
        )}
        {inserted && (
          <button type="button" className="ve-ai__btn ve-ai__btn--primary" onClick={startAgain}>
            Make another
          </button>
        )}
      </div>
    </>
  )

  return (
    <section className="ve-ai" aria-labelledby={showTitle ? `${ids}-title` : undefined}>
      {showTitle && (
        <h2 id={`${ids}-title`} className="ve-ai__title">
          Build with AI
        </h2>
      )}
      <p className="ve-ai__hint">
        Describe what you want. The AI uses your own API key and knows this site&apos;s elements, effects and layout options.
      </p>

      {load.status === 'loading' && (
        <p className="ve-ai__note" role="status">
          Checking which AI models are connected...
        </p>
      )}
      {load.status === 'error' && (
        <div className="ve-ai__empty">
          <p className="ve-ai__error" role="alert">
            {load.message}
          </p>
          <div className="ve-ai__actions">
            <button type="button" className="ve-ai__btn" onClick={retryLoad}>
              Try again
            </button>
          </div>
        </div>
      )}
      {load.status === 'ready' && connected.length === 0 && (
        <div className="ve-ai__empty" role="status">
          <p>No AI model is connected yet.</p>
          <p>
            <a href={INTEGRATIONS_HREF} target="_blank" rel="noopener noreferrer">
              Connect Claude or OpenAI in Integrations
            </a>
          </p>
          <p className="ve-ai__note">Opens in a new tab, so your unsaved edits stay here.</p>
        </div>
      )}

      {load.status === 'ready' && connected.length > 0 && (
        <>
          <ol className="ve-ai__steps" aria-label="Progress">
            {[
              { n: 1, label: 'Brief' },
              { n: 2, label: 'Questions or outline' },
              { n: 3, label: 'Review and insert' },
            ].map((item) => (
              <li key={item.n} aria-current={item.n === stepNumber ? 'step' : undefined} className={item.n === stepNumber ? 've-ai__step--current' : undefined}>
                {item.n}. {item.label}
              </li>
            ))}
          </ol>

          {busy && (
            <div className="ve-ai__status" role="status">
              <span className="ve-ai__spinner" aria-hidden="true" />
              <span>{chars > 0 ? writingText(chars) : progressText(busy, elapsed)}</span>
              <button type="button" className="ve-ai__btn ve-ai__btn--small" onClick={cancel}>
                Cancel
              </button>
            </div>
          )}
          {usage && (
            <p className="ve-ai__note" data-testid="ai-usage">
              {usageText(usage)}
            </p>
          )}
          {usageWarning(usage) && (
            <p className="ve-ai__error" role="status">
              {usageWarning(usage)}
            </p>
          )}
          {error && (
            <p className="ve-ai__error" role="alert">
              {error}
            </p>
          )}

          <fieldset className="ve-ai__fieldset" disabled={busy !== null}>
            {step === 'brief' && briefStep}
            {step === 'questions' && questionsStep}
            {step === 'outline' && outlineStep}
            {step === 'result' && resultStep}
          </fieldset>
        </>
      )}
    </section>
  )
}

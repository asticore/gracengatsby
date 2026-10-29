import { pageAudioField } from '@/features/pageAudio/fields'
import { domainScopedAccess, domainWriteGuard } from '@/features/domains/access'
import { availableDomainsField } from '@/features/domains/field'
import { machineAutoDraftAfterChange } from '@/features/multilingual/machine/autoDraft'
import { outdatedAfterChange } from '@/features/multilingual/outdated'
import { noAdsField } from '@/features/ads/fields'
import { pageSpeedFields } from '@/features/pagespeed/fields'
import { pageSpeedAfterChange, pageSpeedBeforeChange } from '@/features/pagespeed/hooks'
import { indexNowAfterChange, indexNowAfterDelete } from '@/features/seo/indexNowHook'
import type { CollectionConfig } from '@/engine'
import { excludeProtectedAccess } from '@/features/visibility/excludeProtected'

import { roleAccess, roleOrPublished } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'
import { seoFields } from '../fields/seo'
import { schemaTypeField } from '../fields/schemaType'
import { authorshipFields, authorshipBeforeChange } from '../fields/authorship'
import { formatSlugHook } from '../utilities/formatSlug'
import { customFieldsField } from '../fields/customFields'
import { membersOnlyField } from '@/features/members'
import { contentEditGuard, publishGuard } from '@/features/roles/contentEditGuard'
import { reviewFields } from '@/features/approval/fields'
import { readingTimeField, stickyField, trashedAtField } from '@/features/editScreens/fields'
import { seoEditGuard, trashGuard } from '@/features/editScreens/guards'
import { readingTimeBeforeChange } from '@/features/editScreens/readingTime'

export const Posts: CollectionConfig = {
  slug: 'posts',
  dbName: 'eg_posts',
  labels: { singular: 'Post', plural: 'Blog' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishedDate', '_status'],
    group: 'Content',
    description: 'Blog posts. Turn the blog on/off in Settings > Features. Click "Edit visually" above to add extra sections on a drag-and-drop canvas.',
    components: {
      edit: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton'],
      },
    },
  },
  access: {
    create: roleAccess('posts', 'create'),
    delete: domainScopedAccess(roleAccess('posts', 'delete')),
    read: domainScopedAccess(excludeProtectedAccess('posts', roleOrPublished('posts'))),
    update: domainScopedAccess(roleAccess('posts', 'update')),
  },
  versions: { drafts: true },
  fields: [
    availableDomainsField,
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        description: 'Auto-fills from the title as you type - edit it here to override. -> /blog/<slug>',
        components: {
          Field: '@/fields/slug/SlugComponent#SlugComponent',
        },
      },
      hooks: { beforeValidate: [formatSlugHook('title')] },
    },
    { name: 'publishedDate', type: 'date', defaultValue: () => new Date().toISOString(), admin: { position: 'sidebar' } },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar' },
    },
    { name: 'categories', type: 'array', labels: { singular: 'Category', plural: 'Categories' }, fields: [{ name: 'name', type: 'text' }], admin: { position: 'sidebar', initCollapsed: true } },
    pageAudioField,
    { name: 'hideAuthor', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Hide the author byline and link on this post only.' } },
    { name: 'tags', type: 'array', labels: { singular: 'Tag', plural: 'Tags' }, fields: [{ name: 'name', type: 'text' }], admin: { position: 'sidebar', initCollapsed: true, description: 'Public tags. Each links to /blog/tag/<tag>.' } },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    { name: 'excerpt', type: 'textarea', admin: { description: 'Shown on the blog archive card.' } },
    { name: 'content', type: 'richText', required: true },
    {
      name: 'layout',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: {
        description: 'Extra visually-editable sections shown below the post content (galleries, CTAs, etc).',
        initCollapsed: true,
      },
    },
    seoFields,
    customFieldsField,
    membersOnlyField,
    ...authorshipFields,
    ...reviewFields,
    schemaTypeField('posts'),
    noAdsField,
    ...pageSpeedFields,
    stickyField,
    readingTimeField,
    trashedAtField,
  ],
  hooks: {
    beforeChange: [domainWriteGuard, authorshipBeforeChange, trashGuard, seoEditGuard, readingTimeBeforeChange, contentEditGuard, publishGuard, pageSpeedBeforeChange],
    afterChange: [pageSpeedAfterChange('posts'), indexNowAfterChange('posts'), machineAutoDraftAfterChange('posts'), outdatedAfterChange('posts')],
    afterDelete: [indexNowAfterDelete('posts')],
  },
}

/**
 * A bundled list of commonly used passwords, used by the "block common
 * passwords" password rule (src/features/security/passwordPolicy.ts).
 *
 * Kept small and local on purpose: no network call, no licence question, and
 * it works on a cold isolate. It is a floor, not a dictionary. A password on
 * this list is one any attacker tries first, so refusing it is cheap and
 * useful; passing this check proves nothing else about a password. Entries are
 * lower case. Matching is case-insensitive.
 */
export const COMMON_PASSWORDS: readonly string[] = [
  '123456', 'password', '12345678', 'qwerty', '123456789', '12345', '1234', '111111', '1234567', 'dragon',
  '123123', 'baseball', 'abc123', 'football', 'monkey', 'letmein', 'shadow', 'master', '666666', 'qwertyuiop',
  '123321', 'mustang', '1234567890', 'michael', '654321', 'superman', '1qaz2wsx', '7777777', '121212', '000000',
  'qazwsx', '123qwe', 'killer', 'trustno1', 'jordan', 'jennifer', 'zxcvbnm', 'asdfgh', 'hunter', 'buster',
  'soccer', 'harley', 'batman', 'andrew', 'tigger', 'sunshine', 'iloveyou', '2000', 'charlie', 'robert',
  'thomas', 'hockey', 'ranger', 'daniel', 'starwars', 'klaster', '112233', 'george', 'computer', 'michelle',
  'jessica', 'pepper', '1111', 'zxcvbn', '555555', '11111111', '131313', 'freedom', '777777', 'pass',
  'maggie', '159753', 'aaaaaa', 'ginger', 'princess', 'joshua', 'cheese', 'amanda', 'summer', 'love',
  'ashley', 'nicole', 'chelsea', 'biteme', 'matthew', 'access', 'yankees', '987654321', 'dallas', 'austin',
  'thunder', 'taylor', 'matrix', 'minecraft', 'william', 'corvette', 'hello', 'martin', 'heather', 'secret',
  'fucker', 'merlin', 'diamond', 'guitar', 'jackson', 'nothing', 'hannah', 'pussy', 'andrea', 'joseph',
  'morgan', 'cookie', 'chicken', 'banana', 'jasmine', 'arsenal', 'liverpool', 'chelsea1', 'manchester', 'welcome',
  'welcome1', 'password1', 'password123', 'admin', 'admin123', 'administrator', 'root', 'toor', 'changeme', 'default',
  'guest', 'test', 'test123', 'testing', 'demo', 'login', 'system', 'support', 'user', 'qwerty123',
  'qwerty1', 'asdfghjkl', 'asdf1234', 'abcd1234', 'abcdef', 'abcdefg', 'abcdefgh', 'iloveyou1', 'sunshine1', 'princess1',
  'football1', 'baseball1', 'letmein1', 'monkey1', 'dragon1', 'superman1', 'batman1', 'trustno1!', 'p@ssword', 'p@ssw0rd',
  'passw0rd', 'pa55word', 'passw0rd1', 'qwerty12', 'qwer1234', '1q2w3e4r', '1q2w3e', '1qazxsw2', 'zaq12wsx', 'q1w2e3r4',
  'q1w2e3r4t5', '1a2b3c4d', 'a1b2c3d4', 'aa123456', 'iloveu', 'loveyou', 'lovely', 'forever', 'always', 'rainbow',
  'blink182', 'simple', 'mother', 'father', 'family', 'freedom1', 'whatever', 'orange', 'purple', 'silver',
  'golden', 'diamond1', 'secret1', 'cheese1', 'computer1', 'internet', 'samsung', 'iphone', 'google', 'facebook',
  'twitter', 'youtube', 'instagram', 'github', 'linkedin', 'pokemon', 'pikachu', 'zelda', 'mario', 'sonic',
  'starwars1', 'hottie', 'loveme', 'lovers', 'passion', 'sexy', 'gwerty', 'qweasd', 'qweasdzxc', 'zxc123',
  'zxcasd', 'asd123', 'asdasd', 'qwe123', 'qweqwe', 'abc12345', 'abcd', 'abc', 'aaaa', 'zzzzzz',
  'password12', 'password!', 'letmein!', 'welcome!', 'hello123', 'hello1', 'changeme1', 'secret123', 'mypassword', 'mypass',
]

const COMMON_SET = new Set(COMMON_PASSWORDS.map((entry) => entry.toLowerCase()))

/** True when the password (any letter case) is on the bundled list. */
export const isCommonPassword = (password: string): boolean => COMMON_SET.has(password.toLowerCase())

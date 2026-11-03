// Namespace join (en). Keys must match the other language file.
export default {
  meta: { title: 'Join with a class code' },
  title: 'Join with a class code',
  lead: 'Enter the class code your teacher wrote on the board or sent you. The class lab opens right away. No sign-up needed.',
  codeLabel: 'Class code',
  placeholder: 'K7M2QX',
  submit: 'Join class',
  hint: 'Codes have {length} characters; upper or lower case both work. Example: K7M2QX.',
  lookAlikeTitle: 'Class codes never use:',
  lookAlikeSpoken: 'Class codes never use the letter O, the digit 0, the letter I, the digit 1 or the letter L, so they cannot be misread.',
  errors: {
    empty: 'Please enter a class code.',
    short: 'Class codes have {length} characters. Check that you typed all of them.',
    ambiguous: 'Class codes never contain {chars}: the look-alike characters O, 0, I, 1 and L are never used. Please check the code from your teacher.',
    invalid: 'Class codes only contain letters and digits. Remove: {chars}',
    notFound: 'No lab has the code {code}. The code may have a typo, or the teacher has not shared the lab yet or has stopped sharing it.',
  },
  tipsTitle: 'Good to know',
  tips: {
    noAccount: {
      title: 'No account needed',
      body: 'Students join with the code only. No sign-up or sign-in.',
    },
    qr: {
      title: 'Is there a QR code on the screen?',
      body: 'Open the camera app on your phone and point it at the QR code and the lab opens by itself.',
    },
    ask: {
      title: 'Stuck? Ask right there',
      body: 'Inside a lab you can ask the AI tutor about the step or figure you are looking at (if your teacher turned it on).',
    },
  },
  noCode: 'No code yet?',
  browseGallery: 'Browse public labs in the gallery',
}

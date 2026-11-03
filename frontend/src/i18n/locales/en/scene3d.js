// The 3D scenes' own chrome (components/lab3d/sceneLayout.jsx and the deck layouts of the scenes).
export default {
  about: 'About this model',
  view: 'View',
  circulation: {
    diagramShort: 'Diagram',
  },
  semiconductor: {
    checkShort: 'Check',
  },
  study: {
    microbesShort: 'Microorganisms',
    diffusionShort: 'Diffusion D',
    reactionShort: 'A + B → 2B',
    removalShort: 'B → C',
    advanceShort: 'Advance 20 steps',
    resetShort: 'Reset',
    detachShort: 'Lift molecules',
  },
  engineering: {
    crackShort: 'Crack',
  },
  molecule: {
    choose: 'Choose a molecule',
    names: { water: 'Water', carbonDioxide: 'Carbon dioxide', methane: 'Methane' },
    description: {
      water: 'Two hydrogen atoms form a bent shape around oxygen.',
      carbonDioxide: 'Two oxygen atoms lie on a straight line through carbon.',
      methane: 'Four hydrogen atoms occupy the corners of a tetrahedron around carbon.',
    },
    angle: 'Approximate bond angle: {value}°',
    rotate: 'Rotate the model',
    notice: 'The ball-and-stick model illustrates the arrangement; atom sizes and bond lengths are not to scale.',
    source: 'Bond-angle data: NIST',
    unavailable: '3D is unavailable on this device; the 2D diagram still shows how the atoms are arranged.',
  },
}

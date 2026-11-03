// Namespace guide (en). Keys must match the other language file.
export default {
  meta: { title: 'How to use ConceptLab AI' },
  title: 'Teaching and learning with ConceptLab AI',
  lead: 'A short, practical guide for teachers and students, from photographing a textbook page to sharing a lab with your class.',
  toc: {
    label: 'Contents',
    teachers: 'For teachers',
    students: 'For students',
    faq: 'Questions & limits',
  },
  teachers: {
    title: 'For teachers',
    lead: 'Start small: one textbook page, one figure or one formula is enough for a first lab.',
    stepsTitle: 'Create a lab step by step',
    steps: {
      create: {
        title: 'Create a lab',
        body: 'Choose School2Lab or Paper2Explorer, the subject, grade, goal and level of explanation. Choose the Standard AI mode if your sources show students.',
      },
      sources: {
        title: 'Add sources',
        body: 'Upload PDFs or photos of textbook pages, photos of real objects or short videos; enter measurements or notes. Mark sources that show students and confirm you have consent.',
      },
      analyze: {
        title: 'Let the AI analyse',
        body: 'Pick the sources and pages to analyse. Turn on deep analysis (Muse Wonder) for long or complex material.',
      },
      review: {
        title: 'Review the result',
        body: 'Check formulas, variables, units, steps, assumptions and missing information. Edit directly, then mark items as checked.',
      },
      build: {
        title: 'Build the experience',
        body: 'Let the AI create interactive parts from the reviewed analysis, then edit, reorder or add your own.',
      },
      preview: {
        title: 'Preview as a student',
        body: 'Try the lab exactly as students will see it: move sliders, run simulations, answer questions.',
      },
      share: {
        title: 'Share',
        body: 'Automatic checks run before a class code is created. Choose “only people with the code” or “public in the gallery”, and turn the AI tutor on or off.',
      },
      results: {
        title: 'See class results',
        body: 'Aggregates only: the share of correct answers per question, feedback and the questions students asked. Students are never ranked.',
      },
    },
    tipsTitle: 'Tips so the AI reads your material correctly',
    tips: {
      pages: {
        title: 'Photograph textbook pages clearly',
        items: {
          flat: 'Lay the book flat and press the spine gently so the page does not curve.',
          light: 'Use good light and avoid hand shadows and lamp glare.',
          parallel: 'Hold the phone parallel to the page and include the whole formula and figure.',
          onePage: 'One page per photo; for many pages, use a PDF instead.',
          check: 'Zoom in to check: if you can read the text, the AI can too.',
        },
      },
      objects: {
        title: 'Photograph real objects',
        items: {
          background: 'Place the object on a plain background of a different colour.',
          whole: 'Capture the whole object, unobstructed, at its height.',
          measure: 'Measure and type the values yourself (length, mass…): a photo cannot measure accurately. Values you enter are labelled “User-provided”.',
          select: 'Use SAM to select the object in the photo, then review and adjust the selection.',
        },
      },
      videos: {
        title: 'Short, safe practice videos',
        items: {
          short: 'Keep it short, 5 minutes at most; one technique per video.',
          steady: 'Keep the phone still, film in landscape, with good light and the whole movement in frame.',
          safe: 'Warm up properly, practise in a safe area and never ask for movements beyond students’ ability.',
          consent: 'Only film students with their and their parents’ consent, following your school’s rules; avoid close-ups of faces.',
          standard: 'For videos that show students, use the Standard AI mode so the content is not used to train models.',
        },
      },
      review: {
        title: 'Review the AI output',
        items: {
          formula: 'Compare formulas and values with the book: the AI can misread subscripts, signs or units.',
          order: 'Confirm the order of steps when the material does not state it clearly.',
          assumptions: 'State assumptions (for example, ignoring air resistance) so students know the model’s limits.',
          unknown: 'Fill in or remove “Unknown” items before sharing.',
          quiz: 'Approve each question and answer; unapproved questions never reach students.',
        },
      },
      share: {
        title: 'Share in class',
        items: {
          code: 'Write the 6-character code on the board; students open “Join with a class code”.',
          qr: 'Or show the QR code so students can scan it with a phone.',
          projector: 'Put the lab on the projector and zoom the browser so the whole class can see.',
          weak: 'Weak internet in class? Open the lab on the projector before the lesson starts.',
          update: 'Students only see the version you shared. After editing, share again to update it.',
        },
      },
    },
  },
  students: {
    title: 'For students',
    lead: 'Labs are made for trying, guessing, getting it wrong and then getting it. Nothing breaks when you experiment.',
    explore: {
      title: 'Explore a lab',
      items: {
        click: 'Click each step or each part of a figure to see an explanation.',
        sliders: 'Drag a slider or type a number to change a value, then watch the graph and the simulation.',
        run: 'Run, pause and replay; compare two scenarios side by side.',
        hide: 'Hide the labels on a diagram to test how much you remember.',
      },
    },
    active: {
      title: 'Active learning: predict first, check after',
      steps: {
        predict: 'Predict the result',
        change: 'Change a value',
        run: 'Run the model',
        compare: 'Compare with your prediction',
        explain: 'Read the explanation and the source',
      },
      note: 'A wrong guess is fine: that is often when you learn the most.',
    },
    ask: {
      title: 'Ask the AI tutor',
      items: {
        speak: 'Type or say your question, for example: “Why did the graph change?”',
        context: 'Ask from the step or figure you are looking at so the AI knows what you mean.',
        citations: 'Numbers like [1] in an answer link to the part of the source that was used; anything beyond the sources is labelled.',
        wrong: 'The AI can be wrong. Open the source to check, and ask your teacher when you are unsure.',
      },
    },
    sources: {
      title: 'Check the sources',
      lead: 'Every piece of information has a label that shows where it came from:',
      note: 'Click a label or a citation to open the right page of the source. “Exact location could not be determined” means the app could not find a reliable location, so look for it in the document yourself.',
    },
  },
  faq: {
    title: 'Questions and honest limits',
    lead: 'What you should know, said plainly.',
    items: {
      wrong: {
        q: 'Can the AI be wrong?',
        a: 'Yes. The AI can misread a formula, misunderstand a figure or give an inaccurate answer. That is why AI-generated content is labelled for review, teachers confirm it before sharing, and answers always come with sources to check.',
      },
      grading: {
        q: 'Does the app grade movements or detect injuries from videos?',
        a: 'No. The current version does not grade movements, measure joint angles precisely or diagnose injury risk. The AI only suggests moments worth watching; the teacher stays in charge of assessment and coaching.',
      },
      simulation: {
        q: 'Are simulation results real measurements?',
        a: 'No. A simulation is a model running under the stated assumptions (for example, a small angle and no air resistance). It helps you understand trends but does not replace real measurements or experiments. Automatic checks help find errors but do not prove a model correct in every situation.',
      },
      modes: {
        q: 'What is the difference between the Contributor and Standard AI modes?',
        a: 'In Contributor mode, content sent to the AI may be used by Meta to train future models, in exchange for a lower cost. In Standard mode, content is not used for training. Use Standard for photos or videos showing students and for private documents. Each lab can choose its own mode.',
      },
      account: {
        q: 'Do students need an account?',
        a: 'Not to join a class or explore a lab. Students only need an account to create their own labs. Students under 16 should sign up with the agreement of a teacher or parent.',
      },
      visibility: {
        q: 'Who can see my labs?',
        a: 'A lab is a private draft until you share it. When you share, you choose “only people with the code or link” or “public in the gallery”, and you can stop sharing at any time.',
      },
      delete: {
        q: 'How do I delete my data?',
        a: 'You can delete individual sources while editing a lab, delete a whole lab from “My labs”, and delete your entire account from the Account page. Deleting also removes the uploaded files from the app’s server.',
      },
      offline: {
        q: 'Does it work without internet?',
        a: 'You need a connection to open labs and use AI features. The app is built to stay light on slow networks; if the internet in class is weak, open the lab on the projector before the lesson.',
      },
      ranking: {
        q: 'Do class results rank students?',
        a: 'No. Teachers only see aggregates, such as the share of correct answers per question. The app never ranks students and never uses video to identify anyone.',
      },
    },
  },
  cta: {
    title: 'Ready to try?',
    body: 'Start with the textbook page you are teaching, or open an example lab to see what students experience.',
    create: 'Create your first lab',
    gallery: 'See example labs',
  },
}

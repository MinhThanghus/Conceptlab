import { fontsReady, job } from './lib.js'
import { measureQuotes } from './quotes.js'
import { renderPassPanels } from './figure-volleyball.js'

job(async () => {
  await fontsReady(['700 50px "Lexend Variable"', '400 24px "Be Vietnam Pro"', 'italic 400 24px "Be Vietnam Pro"', '600 24px "Be Vietnam Pro"'])
  const imgs = [...document.querySelectorAll('.panel img')]
  const stage = imgs[0].parentElement.getBoundingClientRect()
  const { urls, info } = await renderPassPanels({ width: Math.round(stage.width), height: Math.round(stage.height), ratio: 4 })
  await Promise.all(
    imgs.map((img, i) => {
      img.src = urls[i]
      return img.decode()
    }),
  )
  await document.fonts.ready
  return async ({ quotes }) => {
    const page = document.getElementById('page')
    return { ...measureQuotes(page, quotes, { width: 1240, height: 1754 }), panels: info }
  }
})

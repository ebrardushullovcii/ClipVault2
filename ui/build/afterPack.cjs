const path = require('path')
const rcedit = require('rcedit')

exports.default = async function afterPack(context) {
  if (process.platform !== 'win32') return

  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  )
  const iconPath = path.join(__dirname, '..', 'public', 'icons', 'icon.ico')

  console.log(`  • rcedit: setting icon on ${path.basename(exePath)}`)
  await rcedit(exePath, { icon: iconPath })
}

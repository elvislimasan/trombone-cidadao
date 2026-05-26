import UIKit
import Capacitor

// O Capacitor iOS registra apenas os plugins listados em `packageClassList`
// (capacitor.config.json), que é gerado a partir dos packages instalados.
// Como o VideoProcessor é um plugin LOCAL do app (não é um package), ele não
// entra nessa lista e nunca seria registrado. Aqui registramos manualmente,
// de forma durável (sobrevive a `npx cap sync`).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VideoProcessorPlugin())
    }
}

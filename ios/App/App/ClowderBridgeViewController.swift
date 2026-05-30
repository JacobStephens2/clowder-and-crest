import UIKit
import Capacitor

// Capacitor's default bridge view controller, subclassed only to register the
// local ClowderBridgePlugin (which isn't an npm package, so it has no
// auto-discovered Package.swift). Main.storyboard points its root view
// controller at this class instead of the stock CAPBridgeViewController.
class ClowderBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ClowderBridgePlugin())
    }
}

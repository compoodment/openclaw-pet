import AppKit
import WebKit

final class DragSurface: NSView {
  override func mouseDown(with event: NSEvent) {
    window?.performDrag(with: event)
  }
}

guard CommandLine.arguments.count >= 4,
      let port = Int(CommandLine.arguments[1]),
      let size = Int(CommandLine.arguments[2]) else { exit(2) }
let corner = CommandLine.arguments[3]
let frame = NSScreen.main?.visibleFrame ?? .zero
let edge: CGFloat = 20
let x = corner.contains("left") ? frame.minX + edge : frame.maxX - CGFloat(size) - edge
let y = corner.contains("top") ? frame.maxY - CGFloat(size) - edge : frame.minY + edge
let panel = NSPanel(contentRect: NSRect(x: x, y: y, width: CGFloat(size), height: CGFloat(size)), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
panel.level = NSWindow.Level.floating; panel.collectionBehavior = [NSWindow.CollectionBehavior.canJoinAllSpaces, NSWindow.CollectionBehavior.fullScreenAuxiliary, NSWindow.CollectionBehavior.stationary]
panel.isOpaque = false; panel.backgroundColor = NSColor.clear; panel.hasShadow = false; panel.ignoresMouseEvents = false
let web = WKWebView(frame: panel.contentView!.bounds); web.setValue(false, forKey: "drawsBackground")
let html = "<style>html,body{margin:0;background:transparent;overflow:hidden}canvas{width:100vw;height:100vh;image-rendering:pixelated}</style><canvas></canvas><script>const c=document.querySelector('canvas'),x=c.getContext('2d'),i=new Image();i.src='http://127.0.0.1:\(port)/spritesheet.webp';const r={idle:[0,6,[280,110,110,140,140,320]],review:[8,6,[150,150,150,150,150,280]],running:[7,6,[120,120,120,120,120,220]],jumping:[4,5,[140,140,140,140,280]],failed:[5,8,[140,140,140,140,140,140,140,240]],waiting:[6,6,[150,150,150,150,150,260]]};let s={animation:'idle'},f=0,n=0,w=0,h=0;async function p(){try{s=await fetch('http://127.0.0.1:\(port)/state',{cache:'no-store'}).then(q=>q.json())}catch{}setTimeout(p,75)}p();function d(t){let a=r[s.animation]||r.idle;if(t>=n){f=(f+1)%a[1];n=t+a[2][f]}if(i.complete){if(w!==innerWidth||h!==innerHeight){w=c.width=innerWidth;h=c.height=innerHeight}x.clearRect(0,0,w,h);x.imageSmoothingEnabled=false;let z=Math.min(w/192,h/208),pw=192*z,ph=208*z;x.drawImage(i,f*192,a[0]*208,192,208,(w-pw)/2,(h-ph)/2,pw,ph)}requestAnimationFrame(d)}requestAnimationFrame(d)</script>"
web.loadHTMLString(html, baseURL: nil)
panel.contentView?.addSubview(web)
let dragSurface = DragSurface(frame: panel.contentView!.bounds)
dragSurface.autoresizingMask = [.width, .height]
dragSurface.wantsLayer = true
dragSurface.layer?.backgroundColor = NSColor.clear.cgColor
panel.contentView?.addSubview(dragSurface)
panel.orderFrontRegardless(); NSApplication.shared.setActivationPolicy(.accessory); NSApplication.shared.run()

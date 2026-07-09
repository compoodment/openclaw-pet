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
let panelWidth = max(CGFloat(size), 300)
let panelHeight = CGFloat(size) + 126
let panel = NSPanel(contentRect: NSRect(x: x - (panelWidth - CGFloat(size)), y: y, width: panelWidth, height: panelHeight), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
panel.level = NSWindow.Level.floating; panel.collectionBehavior = [NSWindow.CollectionBehavior.canJoinAllSpaces, NSWindow.CollectionBehavior.fullScreenAuxiliary, NSWindow.CollectionBehavior.stationary]
panel.isOpaque = false; panel.backgroundColor = NSColor.clear; panel.hasShadow = false; panel.ignoresMouseEvents = false; panel.becomesKeyOnlyIfNeeded = true
let web = WKWebView(frame: panel.contentView!.bounds); web.setValue(false, forKey: "drawsBackground")
let html = """
<style>
html,body{margin:0;background:transparent;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#card{position:absolute;right:0;bottom:\(size - 16)px;width:calc(100% - 10px);padding:13px 38px 13px 16px;box-sizing:border-box;border:1px solid rgba(255,255,255,.16);border-radius:24px;background:rgba(34,34,35,.97);color:#f5f5f5;box-shadow:0 2px 8px rgba(0,0,0,.38)}
#title{font-size:16px;line-height:20px;font-weight:750;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#status{display:block;margin-top:5px;font-size:13px;line-height:17px;color:#f0f0f2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.spinner{position:absolute;right:18px;top:50%;width:15px;height:15px;margin-top:-8px;border:2px solid rgba(255,255,255,.34);border-top-color:#fff;border-radius:50%;animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
button{position:absolute;right:\(size - 26)px;bottom:\(size - 27)px;width:34px;height:34px;border:1px solid rgba(255,255,255,.13);border-radius:50%;background:rgba(31,31,32,.96);color:#d7d7da;font-size:24px;line-height:26px;cursor:pointer;z-index:2}button:focus-visible{outline:2px solid #9ab7ff;outline-offset:2px}.hidden #card,.collapsed #card,.hidden button{display:none}.collapsed button{transform:rotate(180deg)}
canvas{position:absolute;right:0;bottom:0;width:\(size)px;height:\(size)px;image-rendering:pixelated}
</style><main id="shell"><section id="card" aria-live="polite"><div id="title">OpenClaw activity</div><span id="status">Ready</span><span class="spinner" aria-hidden="true"></span></section><button id="toggle" aria-label="Hide activity card" aria-expanded="true">⌄</button></main><canvas></canvas><script>
const c=document.querySelector('canvas'),x=c.getContext('2d'),label=document.querySelector('#status'),shell=document.querySelector('#shell'),toggle=document.querySelector('#toggle'),i=new Image();i.src='http://127.0.0.1:\(port)/spritesheet.webp';
const r={idle:[0,6,[280,110,110,140,140,320]],review:[8,6,[150,150,150,150,150,280]],running:[7,6,[120,120,120,120,120,220]],jumping:[4,5,[140,140,140,140,280]],failed:[5,8,[140,140,140,140,140,140,140,240]],waiting:[6,6,[150,150,150,150,150,260]]};let s={animation:'idle',activityLabel:'Ready'},f=0,n=0,w=0,h=0;
let collapsed=false;toggle.onclick=()=>{collapsed=!collapsed;shell.classList.toggle('collapsed',collapsed);toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'Show activity card':'Hide activity card')};function renderState(){const isIdle=s.animation==='idle'&&s.activityLabel==='Ready';shell.classList.toggle('hidden',isIdle);label.textContent=s.activityLabel||'Ready'}async function p(){try{s=await fetch('http://127.0.0.1:\(port)/state',{cache:'no-store'}).then(q=>q.json());renderState()}catch{shell.classList.remove('hidden');label.textContent='Waiting for OpenClaw'}setTimeout(p,75)}p();
function d(t){let a=r[s.animation]||r.idle;if(t>=n){f=(f+1)%a[1];n=t+a[2][f]}if(i.complete){let cw=c.clientWidth,ch=c.clientHeight;if(w!==cw||h!==ch){w=c.width=cw;h=c.height=ch}x.clearRect(0,0,w,h);x.imageSmoothingEnabled=false;let z=Math.min(w/192,h/208),pw=192*z,ph=208*z;x.drawImage(i,f*192,a[0]*208,192,208,(w-pw)/2,(h-ph)/2,pw,ph)}requestAnimationFrame(d)}requestAnimationFrame(d)
</script>
"""
web.loadHTMLString(html, baseURL: nil)
panel.contentView?.addSubview(web)
let dragSurface = DragSurface(frame: NSRect(x: panelWidth - CGFloat(size), y: 0, width: CGFloat(size), height: CGFloat(size - 38)))
dragSurface.autoresizingMask = []
dragSurface.wantsLayer = true
dragSurface.layer?.backgroundColor = NSColor.clear.cgColor
panel.contentView?.addSubview(dragSurface)
panel.orderFrontRegardless(); NSApplication.shared.setActivationPolicy(.accessory); NSApplication.shared.run()

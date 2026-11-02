import { Code2, ExternalLink, Hammer, Lightbulb, Play, X } from 'lucide-react'
import { Button, Sheet } from '../../../../ui'

/**
 * Three steps, over the top-left corner of the level the first time a kid opens the Hackable Platformer. It never
 * blocks the level (no backdrop), sits away from Play's buttons and the Duo's hinge, and Help opens it again.
 */
export function FirstRunTips({ phone, noCode, onClose }: { phone: boolean; noCode: boolean; onClose: () => void }) {
  return (
    <section className="cl-tips cl-rise" aria-label="Three steps to start">
      <div className="cl-tips-head">
        <strong>Three steps to start</strong>
        <button type="button" className="cl-icon-btn" aria-label="Close the tips" onClick={onClose}><X size={16} /></button>
      </div>
      <ol className="cl-tips-steps">
        <li><span className="cl-tips-icon" aria-hidden="true"><Hammer size={16} /></span><span><b>Build.</b> {phone ? 'Press Bricks, pick one, then tap the level to place it.' : 'Pick a brick, then tap or click the level to place it.'}</span></li>
        <li><span className="cl-tips-icon" aria-hidden="true"><Code2 size={16} /></span><span><b>Code.</b> {noCode ? 'On a bigger screen, open a brick’s code. Switch a script off to see what it does.' : 'Open a brick’s code. Switch a script off to see what it does.'}</span></li>
        <li><span className="cl-tips-icon" aria-hidden="true"><Play size={16} /></span><span><b>Play.</b> Press Play to try your level.</span></li>
      </ol>
      <button type="button" className="cl-btn cl-btn-primary cl-btn-sm cl-tips-ok" onClick={onClose}>Got it</button>
    </section>
  )
}

/** Help in the studio header: short how-tos in plain words, the tips again, and the site's own help page. */
export function HelpSheet({ open, onClose, onShowTips }: { open: boolean; onClose: () => void; onShowTips: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Help"
      description="How to build, code and play your level."
      variant="dialog"
      size="md"
      className="cl-help"
      footer={<div className="cl-help-foot">
        <Button icon={<Lightbulb size={18} />} onClick={onShowTips}>Show the first-run tips again</Button>
        <Button variant="quiet" href="/help#how" target="_blank" rel="noopener" icon={<ExternalLink size={18} />}>More help</Button>
      </div>}
    >
      <div className="cl-help-body">
        <section>
          <h3><Hammer size={18} aria-hidden="true" /> Build</h3>
          <p>Pick a brick in Bricks, then tap or click the level to place it. Drag to place lots. Erase takes bricks away, and Undo brings them back.</p>
          <p>Tap a brick in the level to change its sliders, like how fast it goes.</p>
          <p><b>New brick:</b> pick a picture (or draw one), give it a name, and place it. No code needed.</p>
        </section>
        <section>
          <h3><Code2 size={18} aria-hidden="true" /> Code</h3>
          <p>Tap a brick, then press <b>See inside</b>. Code needs a laptop, Chromebook or tablet.</p>
          <p><b>Switches:</b> every script has an On/Off switch. Turn one off, press Restart, and see what changes.</p>
          <p><b>+ Power:</b> snap a ready-made power onto a brick, like a double jump. Turn it off or take it off any time.</p>
          <p><b>My Blocks:</b> the brick’s own blocks. Open one to see the steps inside and change a number.</p>
        </section>
        <section>
          <h3><Play size={18} aria-hidden="true" /> Play</h3>
          <p>Press Play to try your level. Arrow keys move and Space jumps. On a touch screen, use the buttons on the screen. Press Build to go back.</p>
        </section>
        <section>
          <h3>Saving and sharing</h3>
          <p>Your project saves by itself. The chip next to its name says where: on this computer, or in your account when you are signed in. Tap it to find out more.</p>
          <p>To keep a copy or give it to a friend, open the ⋯ menu and press Save File. Open File there opens one.</p>
        </section>
      </div>
    </Sheet>
  )
}

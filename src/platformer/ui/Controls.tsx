/** How to play and build, for whichever controls this device has. */
export function Controls({ touch, gamepad }: { touch: boolean; gamepad: string | null }) {
  return (
    <div className="p2d-controls">
      <section>
        <h3>Playing</h3>
        <dl>
          {touch ? (
            <>
              <dt>Move</dt>
              <dd>Slide your thumb on the pad</dd>
              <dt>Jump</dt>
              <dd>Jump. Hold it to go higher</dd>
              <dt>Run</dt>
              <dd>Hold Run. Keep running to fill the meter and jump even further</dd>
            </>
          ) : (
            <>
              <dt>Move</dt>
              <dd>
                <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd>
              </dd>
              <dt>Jump</dt>
              <dd>
                <kbd>Space</kbd> or <kbd>X</kbd>. Hold it to go higher
              </dd>
              <dt>Run</dt>
              <dd>
                Hold <kbd>Shift</kbd> or <kbd>Z</kbd>. Keep running to fill the meter and jump even further
              </dd>
              <dt>Crouch</dt>
              <dd>
                <kbd>↓</kbd> or <kbd>S</kbd>
              </dd>
              <dt>Menu</dt>
              <dd>
                <kbd>Esc</kbd>. <kbd>Tab</kbd> switches between playing and building
              </dd>
            </>
          )}
          <dt>Wall jump</dt>
          <dd>Slide down a wall, then jump</dd>
          <dt>Springs</dt>
          <dd>Hold jump as you land for a big bounce</dd>
          <dt>Sparks</dt>
          <dd>With the spark power-up, the run button throws sparks</dd>
        </dl>
      </section>
      <section>
        <h3>Building</h3>
        <dl>
          {touch ? (
            <>
              <dt>Place</dt>
              <dd>Pick something in the bar, then tap or drag</dd>
              <dt>Erase</dt>
              <dd>Pick the eraser, then tap or drag</dd>
              <dt>Look around</dt>
              <dd>Drag with two fingers</dd>
            </>
          ) : (
            <>
              <dt>Place</dt>
              <dd>
                Pick something in the bar, then click or drag. <kbd>1</kbd>–<kbd>6</kbd> pick too
              </dd>
              <dt>Erase</dt>
              <dd>
                Right-click, or the eraser (<kbd>E</kbd>)
              </dd>
              <dt>Look around</dt>
              <dd>
                Arrow keys, scroll, or drag with <kbd>Space</kbd> held
              </dd>
              <dt>Undo</dt>
              <dd>
                <kbd>Ctrl</kbd> or <kbd>⌘</kbd> + <kbd>Z</kbd>
              </dd>
              <dt>Test from here</dt>
              <dd>
                <kbd>P</kbd> puts your player at the cursor
              </dd>
            </>
          )}
          <dt>Hide items</dt>
          <dd>Drop a coin or power-up onto a ? block or brick</dd>
        </dl>
      </section>
      <section>
        <h3>Controller</h3>
        <p>
          Bottom or right button jumps, left or top button runs. Start opens the menu, Select switches to building.{' '}
          {gamepad ? `Connected: ${gamepad.slice(0, 40)}.` : 'Press any button on a controller to connect it.'}
        </p>
      </section>
    </div>
  )
}

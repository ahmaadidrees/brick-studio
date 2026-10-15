/** How to play and build, for whichever controls this device has. */
export function Controls({ touch, gamepad, race = false }: { touch: boolean; gamepad: string | null; race?: boolean }) {
  if (race) return <RaceControls touch={touch} gamepad={gamepad} />
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

/** Race tracks: driving, items and building a track. */
function RaceControls({ touch, gamepad }: { touch: boolean; gamepad: string | null }) {
  return (
    <div className="p2d-controls">
      <section>
        <h3>Racing</h3>
        <dl>
          {touch ? (
            <>
              <dt>Steer</dt>
              <dd>Slide your left thumb on the pad</dd>
              <dt>Gas and brake</dt>
              <dd>Hold Gas or Brake with your right thumb</dd>
              <dt>Item</dt>
              <dd>Tap the item button above them</dd>
            </>
          ) : (
            <>
              <dt>Steer</dt>
              <dd>
                <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd>
              </dd>
              <dt>Gas and brake</dt>
              <dd>
                <kbd>↑</kbd> and <kbd>↓</kbd>, or <kbd>W</kbd> and <kbd>S</kbd>
              </dd>
              <dt>Item</dt>
              <dd>
                <kbd>Space</kbd> uses the item you are holding
              </dd>
              <dt>Menu</dt>
              <dd>
                <kbd>Esc</kbd>. <kbd>Tab</kbd> switches between racing and building
              </dd>
            </>
          )}
          <dt>? blocks</dt>
          <dd>Drive through one for a random item: Turbo, Oil slick, Bouncy ball, Spark or Shield</dd>
          <dt>Coins</dt>
          <dd>Each one adds a little top speed, up to 10. Spinning out drops some</dd>
          <dt>Laps</dt>
          <dd>Cross the finish line the way its arrows point, after going all the way round</dd>
        </dl>
      </section>
      <section>
        <h3>Building</h3>
        <dl>
          {touch ? (
            <>
              <dt>Place</dt>
              <dd>Pick a brick, then tap or drag</dd>
              <dt>Look around</dt>
              <dd>Drag with two fingers; pinch to see more of the track</dd>
            </>
          ) : (
            <>
              <dt>Place</dt>
              <dd>Pick a brick, then click or drag. Right-click erases</dd>
              <dt>Turn</dt>
              <dd>
                <kbd>R</kbd> turns boost pads, Walkers, the grid and the finish line
              </dd>
              <dt>See the whole track</dt>
              <dd>
                <kbd>−</kbd> and <kbd>=</kbd> zoom, <kbd>0</kbd> shows the whole track
              </dd>
              <dt>Undo</dt>
              <dd>
                <kbd>Ctrl</kbd> or <kbd>⌘</kbd> + <kbd>Z</kbd>
              </dd>
            </>
          )}
        </dl>
      </section>
      <section>
        <h3>Controller</h3>
        <p>
          The stick or d-pad steers, up is gas and down is brake; the bottom button uses your item.{' '}
          {gamepad ? `Connected: ${gamepad.slice(0, 40)}.` : 'Press any button on a controller to connect it.'}
        </p>
      </section>
    </div>
  )
}

# Code Lab: small experiments

The lab is for trying an idea, seeing what changed, and keeping the version that works. It is single-player: your
level and code save in this browser's local storage. There is no account save, sharing, room play, or cross-device
sync. **JavaScript** and **Python** are read-only views of the blocks.

## Start with a blank brick

1. Choose **Build**, then **+ Add** → **Make a new brick**. Pick its costume and name, then choose **Make**. It is
   added to the level and opens with a **when I appear** hat.
2. Drag a block from a colored category into that hat's script. For example, add **set my color to…** or **say… for…**.
   Hover over or tap a block for its tip. The **How to make your own code** help has short notes on variables,
   messages, coordinates, and reusable blocks.
3. Before pressing **Play**, say what you expect: “When this brick appears, it will say ‘Hi!’ for one second.” Run
   it and watch the stage. Change one value, predict again, and run it again. One change at a time makes cause and
   effect easier to see.

You can edit while playing too; the lab applies code changes to the running thing. Press **Build** when you want
time to stand still while you arrange the level.

## Draw a character that reacts

1. Open the character's look editor and draw at least two costume frames. Each frame is a picture you can change;
   the frame blocks choose and animate those pictures.
2. Choose **react-character** in **I want to…**. Its code plays the frames at four per second. Press Play and click
   the character: it says “I made this!” and advances a frame.
3. Open the character's code. Change the frame rate or speech, predict what will happen, and try it again. Add more
   frames in the look editor to make a longer animation.

## Build a car you can ride

1. Choose **programmable-car** in **I want to…**, then walk beside the car and press ↑. The car checks whether you
   are touching it and stores `driving = 1` on itself.
2. Read the `forever` script. While `driving` is 1, it checks horizontal arrow keys, sets the car's speed, and
   keeps the visible player seated. When you press ↓, it places the player beside the car and restores controls and
   physics.
3. Change the `3` in a movement block to `2` or `5`. Predict whether the car will move more slowly or quickly,
   then test the change. These are regular variable, sensing, and movement blocks; the recipe does not call the
   old ride shortcut.

## Share a number

Open **Variables** and use matching short names on the set and read blocks. The scope says who owns the number:

- **my** belongs to this one brick instance;
- **the player's** is shared by the player and every brick;
- **the world's** is shared by all things in the level.

For example, have the player set the world's `signal` to 1 and broadcast `GO`. A vehicle can start code with **when
I receive GO**, then read the world's `signal` to decide what to do. The stage inspector shows current world
variables under **World variables**. Messages are one-tick signals; a message sent while a matching script is still
running is skipped for that script.

## Make a reusable behavior

Open **My Blocks**, drag out **define**, and give the definition a short name, such as `patrolAtSpeed`. Add a number
input named `pace`, then put **set my speed forward to input pace** inside a **forever** block. Add a wall check and
**turn around** if you want it to reverse at an edge or wall. Drag **run my block** into **when I appear**, give it
the same name, and set its `pace` input to a number. Add a **wait** and **turn around** inside the forever block
to make it patrol back and forth. Select the run block to open the definition. Change the number
in the call, predict whether it will move faster or slower, then test the edited version.

A definition does nothing until a matching run block calls it. Input values are numbers, up to three per definition.
Calls can be nested, but deep recursion has a runtime limit.

## Inspect, save, and reopen

Click a thing on the stage to watch its live speed, ground/rider state, and memories. Use **In this level** and **See
inside** to open another thing's code; the blocks that just ran glow. A memory can also be shown over its thing with
the eye button. Click the stage before playing to give it the keyboard: arrows move, space jumps, X runs, and Z, ↑,
and ↓ are free for your own code.

Edits save automatically in this browser. Reload the Code Lab in the same browser profile to reopen them. **Start the
lab over** clears the saved lab. Text panes do not turn edits back into blocks; keep changes in the block workspace.

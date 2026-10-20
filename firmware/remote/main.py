# Brickgineers Remote: one fixed program, flashed once onto a BBC micro:bit V2.
# It reports raw inputs over USB serial and obeys a few simple commands.
# Protocol: src/microbit/protocol.ts (also described in firmware/remote/README.md).
from microbit import *
import music
import utime

uart.init(baudrate=115200)

TILT_EVERY = 50      # ms between tilt checks (about 20 per second)
TILT_KEEPALIVE = 500  # ms between tilt lines even when nothing moved
TILT_DEADBAND = 40   # milli-g a value must move before we send it
BUF_MAX = 64         # longest line we keep; longer lines are dropped
TEXT_MAX = 40

# Inputs: (name, test function). 'a 1' / 'a 0' are sent when the state changes.
NAMES = ('a', 'b', 'logo', 'p0', 'p1', 'p2')
TESTS = (
    button_a.is_pressed,
    button_b.is_pressed,
    pin_logo.is_touched,
    pin0.is_touched,
    pin1.is_touched,
    pin2.is_touched,
)
LINES_DOWN = tuple(n + ' 1\n' for n in NAMES)
LINES_UP = tuple(n + ' 0\n' for n in NAMES)
state = [False] * len(NAMES)

GESTURE_LINES = {
    'shake': 'g shake\n',
    'up': 'g up\n',
    'down': 'g down\n',
    'left': 'g left\n',
    'right': 'g right\n',
    'face up': 'g faceup\n',
    'face down': 'g facedown\n',
    'freefall': 'g freefall\n',
}

IMAGE_NAMES = ('heart', 'happy', 'sad', 'yes', 'no', 'surprised', 'angry', 'skull',
               'star', 'diamond', 'target', 'arrow_n', 'arrow_s', 'arrow_e', 'arrow_w')
TUNE_NAMES = ('power_up', 'power_down', 'jump_up', 'jump_down', 'ba_ding',
              'entertainer', 'nyan', 'dadadadum', 'wawawawaa', 'punchline')
IMAGES = {}
for _n in IMAGE_NAMES:
    _v = getattr(Image, _n.upper(), None)
    if _v is not None:
        IMAGES[_n] = _v
TUNES = {}
for _n in TUNE_NAMES:
    _v = getattr(music, _n.upper(), None)
    if _v is not None:
        TUNES[_n] = _v


def clamp(v, lo, hi):
    if v < lo:
        return lo
    if v > hi:
        return hi
    return v


def to_int(s):
    # int() of a string like '12', '-3' or '4.0'; raises ValueError when it isn't a number.
    if '.' in s:
        s = s.split('.')[0]
    return int(s)


def handle(line):
    # One command line, already stripped. Anything we don't understand is ignored.
    if line == 'hi':
        uart.write('bg 1\n')
        return
    if line == 'clear':
        display.clear()
        return
    sp = line.find(' ')
    if sp < 0:
        return
    cmd = line[:sp]
    arg = line[sp + 1:].strip()
    if cmd == 'show':
        img = IMAGES.get(arg)
        if img is not None:
            display.show(img, wait=False)
    elif cmd == 'num':
        n = clamp(to_int(arg), -99999, 99999)
        display.scroll(str(n), wait=False)
    elif cmd == 'text':
        display.scroll(arg[:TEXT_MAX], wait=False)
    elif cmd == 'tone':
        parts = arg.split()
        if len(parts) == 2:
            hz = clamp(to_int(parts[0]), 20, 20000)
            ms = clamp(to_int(parts[1]), 1, 5000)
            music.pitch(hz, ms, pin=None, wait=False)
    elif cmd == 'tune':
        tune = TUNES.get(arg)
        if tune is not None:
            music.play(tune, pin=None, wait=False)


buf = bytearray(BUF_MAX)
blen = 0
overflow = False


def read_serial():
    # Non-blocking: take whatever bytes are waiting and run each complete line.
    global blen, overflow
    n = uart.any()
    if not n:
        return
    data = uart.read(min(n, 32))
    if not data:
        return
    for c in data:
        if c == 10 or c == 13:
            if overflow:
                overflow = False
            elif blen:
                n = blen
                blen = 0
                try:
                    handle(str(bytes(buf[:n]), 'utf-8').strip())
                except Exception:
                    pass
        elif not overflow:
            if blen >= BUF_MAX:
                blen = 0
                overflow = True
            else:
                buf[blen] = c
                blen += 1


display.show(Image.HAPPY, wait=False)
uart.write('bg 1\n')

last_x = 0
last_y = 0
last_tilt_check = utime.ticks_ms()
last_tilt_sent = last_tilt_check
last_gesture = ''

while True:
    now = utime.ticks_ms()

    # Buttons, logo and pins: send only changes.
    for i in range(6):
        down = TESTS[i]()
        if down != state[i]:
            state[i] = down
            uart.write(LINES_DOWN[i] if down else LINES_UP[i])

    # Tilt: about 20 checks a second, sent when it moved, plus a keep-alive.
    if utime.ticks_diff(now, last_tilt_check) >= TILT_EVERY:
        last_tilt_check = now
        x = clamp(accelerometer.get_x(), -1024, 1024)
        y = clamp(accelerometer.get_y(), -1024, 1024)
        if (abs(x - last_x) > TILT_DEADBAND or abs(y - last_y) > TILT_DEADBAND
                or utime.ticks_diff(now, last_tilt_sent) >= TILT_KEEPALIVE):
            last_x = x
            last_y = y
            last_tilt_sent = now
            uart.write('tilt %d %d\n' % (x, y))

    # Gestures: shake from its history, the rest when the current gesture changes.
    if accelerometer.was_gesture('shake'):
        uart.write(GESTURE_LINES['shake'])
    g = accelerometer.current_gesture()
    if g != last_gesture:
        last_gesture = g
        line = GESTURE_LINES.get(g)
        if line is not None and g != 'shake':
            uart.write(line)

    if microphone.was_event(SoundEvent.LOUD):
        uart.write('g loud\n')

    read_serial()
    sleep(10)

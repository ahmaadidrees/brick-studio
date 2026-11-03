# Car feel: race kit car vs Hackable Car

Written by `src/platformer/lab/feel/race/carFeel.test.ts`. The race kit car is `engine/car.ts` at 60 frames a second
with DEFAULT_CAR_FEEL ("Kart"); the Hackable Car is the open-blocks Car (`studio/race/carBrick.ts`) at 30 ticks a second.

| Measurement | Unit | Race kit | Hackable | Tolerance | Within |
| --- | --- | --- | --- | --- | --- |
| Top speed on road | steps/s | 192.0 | 192.0 | ±3% | yes |
| Time to top speed | ms | 766.7 | 766.7 | ±33.33 ms | yes |
| Stopping distance from top speed | steps | 33.60 | 35.20 | ±2.00 steps | yes |
| Turning circle at top speed | steps | 110.2 | 109.6 | ±4.00 steps | yes |
| Top speed on grass | steps/s | 86.40 | 86.40 | ±3% | yes |
| Top speed on dirt | steps/s | 144.0 | 144.0 | ±3% | yes |
| Boost pad: fastest | steps/s | 304.6 | 302.1 | ±3% | yes |
| Boost pad: time above 1.1 x top speed | ms | 666.7 | 633.3 | ±33.33 ms | yes |
| Drift on ice after 0.5 s of full steering | ° | 61.25 | 60.38 | ±3.00 ° | yes |
| Drift on ice after 1 s of full steering | ° | 60.41 | 59.46 | ±3.00 ° | yes |
| Slide on road after 0.5 s of full steering | ° | 11.80 | 10.31 | ±3.00 ° | yes |

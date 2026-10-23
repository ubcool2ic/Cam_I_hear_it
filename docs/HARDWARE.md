<!-- File: docs/HARDWARE.md | Phase-3 multi-sensor capture hardware design (bands, sensors, filters, MCU/ADC, Macchina sync) -->
# Custom capture hardware (Phase 3 design, not built)

**Goal:** fix the phone's three weaknesses with a small, cheap box:
1. Low-frequency roll-off below about 50 Hz (docs/RESEARCH_ACOUSTICS.md §7).
2. AGC and processing we can't turn off on iOS (§7).
3. No structure-borne pickup for ticks and knock (§5, §6).

Every channel is captured on **one sample clock**. At 750 rpm, 1 ms is 4.5° of crank (§9.6), so independent recorders can't be trusted to line up.

## 1. Band plan (from the research)

| Ch | Sensor | Mount | Band of interest | Why (research §) |
|---|---|---|---|---|
| A | **Piezo contact disc** (or a production knock sensor used as a low-band contact pickup) with a high-impedance preamp | Bolted or clamped to the block / bellhousing, or exhaust hanger near the tailpipe | **2–400 Hz**: firing pulses, half-orders, lope | Idle firing for a V8 at 600–900 rpm is 40–60 Hz, with cycle rate 5–7.5 Hz (§1). MEMS and phone mics roll off below about 50–60 Hz (§7, §11) |
| B | **MEMS I²S mic**, TDK ICS-43434 (60 Hz–20 kHz) or INMP441 (60 Hz–15 kHz) | In a foam/fur windscreen at the tailpipe (0.5 m, 45°) or over the valve cover (20–40 cm) | **0.2–8 kHz**: valvetrain tick, exhaust leak puff, timbre | Airborne mid/high band; position rules in §9–10 |
| C | **Accelerometer**, ADI ADXL1002 (11 kHz 3 dB bandwidth, 21 kHz resonance), *or* a Bosch-style piezo knock sensor (useful 5–15 kHz) | Stud-mounted on the block near the head / knock-sensor boss | **4–15 kHz**: Draper knock modes (about 5–12 kHz for a 4.0 in bore, **derived**, §5); tick impulses | Knock band; airborne pickup through the hood is weak (§5) |
| D | **Sync / reference** channel | n/a | DC–1 kHz | Records the sync pulse sent to the Macchina (§4 below) so audio and CAN share an edge |

Notes:
- The ADXL1002 output must be low-passed below Nyquist. The datasheet's 21 kHz resonance is above our 48 kHz-rate Nyquist of 24 kHz, but close, so keep an analog low-pass on this channel (§2).
- Knock remains a **load test** feature; at idle we don't expect knock (§5).
- A second MEMS mic (B2) can go at the opposite end of the car for front/rear timing (§9.6). Use 2 MEMS on one I²S bus (L/R slots) or the PCM1865's digital-mic inputs.

## 2. Analog front end and filtering

- **Piezo (A):** a piezo disc is a capacitive source. Its low-frequency corner with a resistive load is f_c = 1/(2πRC), so it needs a **high input impedance**. For example, about 10 nF into 10 MΩ gives about 1.6 Hz **(derived; measure the actual disc capacitance)**. Use a JFET or CMOS op-amp buffer or charge amplifier. Add series resistor and TVS clamps for protection, because piezo spikes can exceed rail voltages.
- **High-pass everywhere at about 1–2 Hz** removes DC, thermal drift and handling thumps without touching the 5 Hz cycle rate.
- **Anti-alias:** the ADC suggested below is a delta-sigma part with internal digital decimation filtering. Add a simple RC or 2nd-order analog low-pass at about 20 kHz on the accelerometer and piezo inputs anyway, to keep the sensor resonances (ADXL1002 at 21 kHz; KS4-P at 30 kHz) from overdriving the modulator.
- **No analog band-splitting beyond that.** Splitting into bands (firing / valvetrain / knock) is done **digitally** with the same `lib/` code (`decimate`, `bandEnergies`). That keeps filters exact, repeatable and changeable in firmware.
- **Gain:** fixed gain only, with no AGC (that's the point). The PCM1865 PGA (−12 to +32 dB) is set once per session and its value is logged.

## 3. Digitiser and controller

**Option 1: ESP32-S3 + TI PCM1865 (recommended first build)**
- PCM1865: 4-channel audio ADC, 8–192 kHz sample rate, 110 dB SNR, I²C/SPI control, PGA −12 to +32 dB, and support for up to four digital microphones. Linux drivers are in mainline. Source: https://www.ti.com/product/PCM1865
- ESP32-S3 I²S, per the ESP-IDF docs (https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-reference/peripherals/i2s.html):
  - Two I²S controllers.
  - **TDM up to 16 slots**, but only 4 slots at 32-bit or 8 at 16-bit.
  - PDM RX with up to 4 data lines (8 PDM mics).
  - An ESP-IDF example records 4 mics over TDM via an ES7210 codec.
- Plan: PCM1865 as I²S **TDM 4-slot, 32-bit, 48 kHz** into the ESP32-S3 (one clock for all four channels). Write raw interleaved PCM to SD (WAV, 4 channels), and stream summary features over Wi-Fi or BLE to the phone.
- Data rate: 4 ch × 4 B × 48 kHz = 768 kB/s **(derived)**, fine for SD.
- MEMS I²S mics (B) use the ESP32-S3's **second I²S controller**. Two controllers mean two clocks unless BCLK/WS are shared, so either:
  - (a) run the MEMS mics as the PCM1865's digital-mic inputs, or
  - (b) slave both I²S ports to the same BCLK/WS.

  The single-clock requirement must be confirmed on the bench by recording the shared sync pulse on all channels.

**Option 2: Raspberry Pi (Zero 2 W / 4) + PCM186x HAT.** Easier Python/numpy on-device and the mainline Linux driver, but more power and slower boot. Good for a lab bench, not the first car box.

## 4. Sync with the Macchina M2 (RPM ground truth)

The macchina repo (ubcool2ic/macchina) logs CAN to `.m2l`. Its records carry a `dt_us` timestamp and **MARKER** records from a session button (docs/DESIGN.md), and its docs list RPM via HS-CAN `0x0C9` / OBD PID 0x0C.

Plan:
1. At the start of each capture, the ESP32 drives a **sync GPIO pulse** (e.g., 3 pulses of 10 ms) that:
   - is recorded on **ADC channel D**, giving a sample-exact edge in the audio, and
   - drives the M2's **session-button / digital input** through an opto-isolator or level shifter, giving a MARKER in the CAN log.
   - **To verify:** which M2 input (see macchina docs/M2_J5_PINOUT.md) and whether the firmware logs it with µs timing.
2. Fallback / cross-check: the throttle-blip cross-correlation of audio-derived RPM vs CAN RPM (docs/ML_BACKEND.md §3).
3. Expected alignment is a few ms with the GPIO method, limited by the M2's input sampling and logging. That's enough for RPM labels but not for per-cylinder labels. Per-cylinder alignment would need a crank-position reference, which is **out of scope**: we will not tap ECU sensor wiring.

## 5. Mechanical and environment

- Contact sensors: use stud or magnet mounts on clean metal. Never zip-tie them to hoses. Route cables away from the exhaust, belts and fan.
- Temperature: piezo and accelerometers near the block or exhaust see high heat. Check each part's rated range before mounting near the manifold (ADXL1002 and the MEMS mics have datasheet limits well below exhaust temperatures).
- Mics: foam plus fur windscreen (§8). Fixed height and recorded position zone (§10).
- Power: 12 V from the vehicle through a buck converter with input protection, or a USB power bank (simplest, and isolates the box from alternator noise).

## 6. Bill of materials (indicative, no purchases made)

| Part | Qty | Role |
|---|---|---|
| ESP32-S3 dev board (with PSRAM) | 1 | Controller, I²S TDM master, SD, Wi-Fi/BLE |
| TI PCM1865 breakout / EVM-style board | 1 | 4-ch ADC |
| ICS-43434 or INMP441 breakout | 1–2 | Channel B (MEMS) |
| ADXL1002 eval board *or* knock sensor | 1 | Channel C |
| Piezo disc + JFET/CMOS buffer | 1 | Channel A |
| microSD socket, 12 V→5 V buck, TVS, opto-isolator | – | Storage, power, Macchina sync |

## 7. Open questions / to verify on the bench
- The single-clock claim for MEMS plus ADC on the ESP32-S3: confirm with the shared sync pulse.
- Low-frequency response of the chosen piezo mount (measure against Macchina RPM).
- Which M2 input supports timed MARKERs.
- Whether ADXL1002 vs knock sensor gives better 5–15 kHz SNR on Tyler's LC9 block.

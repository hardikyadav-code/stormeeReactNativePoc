// StormeeAudioModule.swift
// Fix for distorted/fast audio:
// - Hardware audio runs at 44100Hz or 48000Hz
// - Opus packets are 24000Hz
// - We decode Opus→PCM at 24kHz, then use a SECOND AVAudioConverter
//   to resample from 24kHz → hardware rate before scheduling
// - This ensures the player node plays at the correct speed

import Foundation
import AVFoundation
import React

@objc(StormeeAudioModule)
class StormeeAudioModule: NSObject {

    private var engine:        AVAudioEngine?
    private var playerNode:    AVAudioPlayerNode?
    private var opusConverter: AVAudioConverter?   // Opus compressed → PCM16 24kHz
    private var resampleConv:  AVAudioConverter?   // PCM24k → PCM hardware rate

    // Opus always comes in at 24kHz mono (PCM16 or Float32 output)
    private let opusPCMFormat = AVAudioFormat(
      standardFormatWithSampleRate: 24000,
      channels: 1
    )!

    // Hardware output format — set after engine starts
    private var hardwareFormat: AVAudioFormat?
    
    // Chunk counter for logging
    private var decodedChunkCounter = 0

    // MARK: - Initialize

    @objc
    func initialize(_ resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            // Prefer 24kHz — if the hardware supports it we avoid resampling entirely
            try? session.setPreferredSampleRate(24000)
            try session.setActive(true)

            let actualRate = session.sampleRate
            print("✅ AVAudioSession ready | hardware rate: \(actualRate)Hz")

            // Build engine
            let eng    = AVAudioEngine()
            let player = AVAudioPlayerNode()
            eng.attach(player)

            // Get the hardware output format AFTER attaching to engine
            // mainMixerNode.outputFormat reflects the actual hardware rate
            let mainMixer    = eng.mainMixerNode
            let hwOutputFmt  = mainMixer.outputFormat(forBus: 0)
            let hwRate       = hwOutputFmt.sampleRate
            print("📊 Hardware mixer rate: \(hwRate)Hz")

            // The format we'll use for scheduling buffers to the player
            // must match what we feed into playerNode
            // Connect player -> mainMixer using hardware rate so no implicit conversion needed
            let scheduleFormat = AVAudioFormat(
              standardFormatWithSampleRate: hwRate,
              channels: 1
            )!
            eng.connect(player, to: mainMixer, format: scheduleFormat)

            try eng.start()
            print("✅ AVAudioEngine started | schedule format: \(scheduleFormat)")

            self.engine        = eng
            self.playerNode    = player
            self.hardwareFormat = scheduleFormat

            // ── Opus → PCM 24kHz converter ─────────────────────────────────────
            var opusDesc = AudioStreamBasicDescription()
            opusDesc.mSampleRate       = 24000
            opusDesc.mFormatID         = kAudioFormatOpus
            opusDesc.mChannelsPerFrame = 1

            guard let opusFmt = AVAudioFormat(streamDescription: &opusDesc) else {
                reject("INIT_ERROR", "Cannot create Opus AVAudioFormat", nil); return
            }

            guard let opusConv = AVAudioConverter(from: opusFmt, to: opusPCMFormat) else {
                reject("INIT_ERROR",
                       "AVAudioConverter(Opus→PCM) failed. iOS 15+ required.", nil)
                return
            }
            self.opusConverter = opusConv
            print("✅ Opus→PCM24k converter ready")

            // ── PCM 24kHz → hardware rate resampler (skip if rates match) ──────
            if hwRate != 24000 {
                guard let resamp = AVAudioConverter(from: opusPCMFormat, to: scheduleFormat) else {
                    reject("INIT_ERROR", "AVAudioConverter(24k→\(hwRate)) failed", nil); return
                }
                self.resampleConv = resamp
                print("✅ Resampler 24kHz → \(hwRate)Hz ready")
            } else {
                self.resampleConv = nil
                print("✅ Hardware is 24kHz — no resampling needed")
            }

            resolve("initialized")

        } catch {
            reject("INIT_ERROR", error.localizedDescription, error)
        }
    }

    // MARK: - Write Audio Frame

    @objc
    func writeAudioFrame(_ base64Data: String,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {

        guard let opusData = Data(base64Encoded: base64Data), opusData.count > 0 else {
            resolve("skipped-empty"); return
        }

        let hex = opusData.prefix(6).map { String(format: "%02x", $0) }.joined(separator: " ")
        print("\n🎵 ───────────────────────────────────────────────────")
        print("📥 writeAudioFrame received: \(opusData.count)B Opus")
        print("   Hex: [\(hex)]")
        print("─────────────────────────────────────────────────────")

        guard let opusConv   = opusConverter,
              let hwFmt      = hardwareFormat,
              let engine     = engine,
              let player     = playerNode else {
            reject("STATE_ERROR", "Not initialized", nil); return
        }

        DispatchQueue.global(qos: .userInteractive).async {
            do {
                // ─────────────────────────────────────────────────────
                // Step 1: Decode Opus → PCM at 24kHz in Audio Engine
                // ─────────────────────────────────────────────────────
                print("⚙️  Step 1: Opus → PCM24k Decoding...")
                let pcm24k = try self.decodeOpus(opusData, converter: opusConv)
                print("   ✓ Decode complete\n")

                // ─────────────────────────────────────────────────────
                // Step 2: Resample to hardware rate if needed
                // ─────────────────────────────────────────────────────
                let finalBuffer: AVAudioPCMBuffer
                if let resamp = self.resampleConv {
                    print("⚙️  Step 2: PCM24k → Hardware Rate Resampling...")
                    finalBuffer = try self.resample(pcm24k, to: hwFmt, converter: resamp)
                    print("   ✓ Resample complete\n")
                } else {
                    print("⚙️  Step 2: No resampling needed (hardware is 24kHz)\n")
                    finalBuffer = pcm24k
                }

                // ─────────────────────────────────────────────────────
                // Step 3: Schedule for playback
                // ─────────────────────────────────────────────────────
                print("⚙️  Step 3: Scheduling PCM buffer to player...")
                try self.schedule(finalBuffer, player: player, engine: engine)
                print("   ✓ Schedule complete\n")
                
                print("✅ AUDIO PIPELINE COMPLETE")
                print("───────────────────────────────────────────────────\n")
                
                resolve("played")

            } catch {
                print("❌ Pipeline Error: \(error.localizedDescription)\n")
                reject("AUDIO_ERROR", error.localizedDescription, error)
            }
        }
    }

    // MARK: - Decode Opus → PCM 24kHz

    private func decodeOpus(_ opusData: Data,
                             converter: AVAudioConverter) throws -> AVAudioPCMBuffer {

        // ─────────────────────────────────────────────────────────────────
        // Step 1: Parse Opus TOC byte for logging/diagnostics
        // ─────────────────────────────────────────────────────────────────
        guard opusData.count > 0 else { throw AudioErr.emptyResult }
        
        let tocByte = opusData[0]
        let frameConfig = Int((tocByte >> 3) & 0x0F)  // Bits 3-6, cast to Int
        
        // Calculate frame duration in milliseconds (for logging only)
        let frameDurationMs: Int
        switch frameConfig {
        case 0: frameDurationMs = 10
        case 1: frameDurationMs = 20
        case 2: frameDurationMs = 40
        case 3: frameDurationMs = 60
        case 4, 5, 6, 7:
            let base = 100 * (frameConfig - 3)
            frameDurationMs = base
        case 8, 9, 10, 11:
            let base = 100 + 100 * (frameConfig - 8)
            frameDurationMs = base
        case 12, 13, 14, 15:
            let base = 500 + 100 * (frameConfig - 12)
            frameDurationMs = base
        default:
            frameDurationMs = 20
        }
        
        let expectedFrames = (frameDurationMs * 24000) / 1000
        print("🎯 [TOC 0x\(String(tocByte, radix: 16))] Frame config: \(frameConfig) → \(frameDurationMs)ms → \(expectedFrames) samples")

        // ─────────────────────────────────────────────────────────────────
        // Step 2: Wrap Opus in AVAudioCompressedBuffer
        // ─────────────────────────────────────────────────────────────────
        let compBuf = AVAudioCompressedBuffer(
            format: converter.inputFormat,
            packetCapacity: 1,
            maximumPacketSize: max(opusData.count, 4096)
        )

        opusData.withUnsafeBytes { ptr in
            guard let src = ptr.baseAddress else { return }
            compBuf.data.copyMemory(from: src, byteCount: opusData.count)
        }
        compBuf.byteLength  = UInt32(opusData.count)
        compBuf.packetCount = 1

        if let descs = compBuf.packetDescriptions {
            descs[0].mStartOffset            = 0
            descs[0].mDataByteSize           = UInt32(opusData.count)
            descs[0].mVariableFramesInPacket = 0
        }

        print("📦 Compressed buffer: \(opusData.count)B wrapped")

        // ─────────────────────────────────────────────────────────────────
        // Step 3: Allocate output PCM buffer with FIXED maximum capacity
        // 2880 frames = 120ms at 24kHz (maximum Opus frame duration)
        // Actual decoded frame count may be less — we use actual frameLength
        // ─────────────────────────────────────────────────────────────────
        let maxOpusFramesAt24k: AVAudioFrameCount = 2880
        
        guard let pcmBuf = AVAudioPCMBuffer(pcmFormat: converter.outputFormat,
                                             frameCapacity: maxOpusFramesAt24k) else {
            throw AudioErr.bufferFailed("output PCM 24kHz capacity \(maxOpusFramesAt24k)")
        }

        print("📋 PCM buffer allocated: fixed capacity \(maxOpusFramesAt24k) frames @ 24kHz (max 120ms)")

        // ─────────────────────────────────────────────────────────────────
        // Step 4: Decode Opus → PCM using AVAudioConverter
        // ─────────────────────────────────────────────────────────────────
        var inputConsumed = false
        var convError: NSError?

        let status = converter.convert(to: pcmBuf, error: &convError) { _, outStatus in
            if inputConsumed { outStatus.pointee = .noDataNow; return nil }
            inputConsumed = true
            outStatus.pointee = .haveData
            return compBuf
        }

        if let err = convError { 
            throw AudioErr.converterFailed("Opus→PCM: \(err.localizedDescription)") 
        }
        guard status != .error else { 
            throw AudioErr.converterFailed("Opus decoder returned .error") 
        }
        guard pcmBuf.frameLength > 0 else { 
            throw AudioErr.emptyResult 
        }

        // ─────────────────────────────────────────────────────────────────
        // Step 5: LOG DECODED CHUNK - VERIFY CONVERSION SUCCESS
        // ─────────────────────────────────────────────────────────────────
        self.decodedChunkCounter += 1
        let duration = Double(pcmBuf.frameLength) / 24000.0 * 1000.0  // ms
        
        print("✅ [CHUNK #\(self.decodedChunkCounter)] Opus→PCM Conversion Complete")
        print("   ├─ Input: \(opusData.count)B Opus @ 24kHz")
        print("   ├─ Buffer allocated: 2880 frames (fixed max)")
        print("   ├─ Output: \(pcmBuf.frameLength) frames PCM (actual decoded)")
        print("   ├─ Duration: \(String(format: "%.2f", duration))ms")
        print("   ├─ Format: Float32 | Channels: 1 | Rate: 24000Hz")
        print("   └─ Status: Ready for resampling/playback")
        
        return pcmBuf
    }

    // MARK: - Resample PCM 24kHz → hardware rate

    private func resample(_ input: AVAudioPCMBuffer,
                           to outFmt: AVAudioFormat,
                           converter: AVAudioConverter) throws -> AVAudioPCMBuffer {

        // Calculate output frame count based on ratio
        let ratio      = outFmt.sampleRate / input.format.sampleRate
        let outFrames  = AVAudioFrameCount(Double(input.frameLength) * ratio) + 64

        guard let outBuf = AVAudioPCMBuffer(pcmFormat: outFmt, frameCapacity: outFrames) else {
            throw AudioErr.bufferFailed("resample output")
        }

        var inputConsumed = false
        var convError: NSError?

        let status = converter.convert(to: outBuf, error: &convError) { _, outStatus in
            if inputConsumed { outStatus.pointee = .noDataNow; return nil }
            inputConsumed = true
            outStatus.pointee = .haveData
            return input
        }

        if let err = convError { throw AudioErr.converterFailed("Resample: \(err.localizedDescription)") }
        guard status != .error else { throw AudioErr.converterFailed("Resampler returned .error") }
        guard outBuf.frameLength > 0 else { throw AudioErr.emptyResult }

        // Log resampling result
        let inputDuration = Double(input.frameLength) / input.format.sampleRate * 1000.0
        let outputDuration = Double(outBuf.frameLength) / outFmt.sampleRate * 1000.0
        
        print("   🔄 Resampled: \(input.frameLength)f @ \(Int(input.format.sampleRate))Hz → \(outBuf.frameLength)f @ \(Int(outFmt.sampleRate))Hz")
        print("      Duration: \(String(format: "%.2f", inputDuration))ms → \(String(format: "%.2f", outputDuration))ms")

        return outBuf
    }

    // MARK: - Schedule buffer for playback

    private func schedule(_ buf: AVAudioPCMBuffer,
                           player: AVAudioPlayerNode,
                           engine: AVAudioEngine) throws {
        if !engine.isRunning { try engine.start(); print("🔄 Engine restarted") }

        player.scheduleBuffer(buf, completionHandler: nil)

        if !player.isPlaying {
            player.play()
            print("▶️ Playback started")
        }
        
        let duration = Double(buf.frameLength) / buf.format.sampleRate * 1000.0
        print("   📅 Scheduled: \(buf.frameLength) frames @ \(Int(buf.format.sampleRate))Hz (~\(String(format: "%.2f", duration))ms)")
    }

    // MARK: - WAV Test

    @objc
    func playWAVFile(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {

        guard let engine = engine, let player = playerNode else {
            reject("ERROR", "Not initialized", nil); return
        }

        let names = ["test", "audio", "sample",
                     "693ff8790dec6629c2d92da4__online-video-cutter_com___1_"]
        guard let url = names.lazy.compactMap({
            Bundle.main.url(forResource: $0, withExtension: "wav")
        }).first else {
            reject("NOT_FOUND", "No WAV in bundle", nil); return
        }

        do {
            let file = try AVAudioFile(forReading: url)
            if !engine.isRunning { try engine.start() }
            player.scheduleFile(file, at: nil)
            if !player.isPlaying { player.play() }
            print("▶️ WAV: \(url.lastPathComponent)")
            resolve("playing")
        } catch {
            reject("PLAY_ERROR", error.localizedDescription, error)
        }
    }

    // MARK: - Stop

    @objc
    func stop(_ resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
        playerNode?.stop()
        print("⏹️ Stopped")
        resolve("stopped")
    }
}

// MARK: - Errors

enum AudioErr: Error, LocalizedError {
    case bufferFailed(_ name: String)
    case converterFailed(_ msg: String)
    case emptyResult

    var errorDescription: String? {
        switch self {
        case .bufferFailed(let n):    return "Buffer creation failed: \(n)"
        case .converterFailed(let m): return "Converter failed: \(m)"
        case .emptyResult:            return "0 frames decoded"
        }
    }
}

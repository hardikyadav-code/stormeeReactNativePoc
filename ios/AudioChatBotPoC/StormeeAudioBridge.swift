// StormeeAudioModule.swift

import Foundation
import AVFoundation
import React

@objc(StormeeAudioModule)
class StormeeAudioModule: NSObject {

    private var engine:        AVAudioEngine?
    private var playerNode:    AVAudioPlayerNode?
    private var opusConverter: AVAudioConverter?   
    private var resampleConv:  AVAudioConverter?   

    private let opusPCMFormat = AVAudioFormat(
      standardFormatWithSampleRate: 24000,
      channels: 1
    )!

    private var hardwareFormat: AVAudioFormat?
    
    // 🚀 THE FIX: Store chunks as a separate list of envelopes, NOT a single glued Data object!
    private var opusChunks: [Data] = []  
    private var accumulatedChunkCount = 0

    // MARK: - Initialize
    @objc
    func initialize(_ resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            try? session.setPreferredSampleRate(24000)
            try session.setActive(true)

            let actualRate = session.sampleRate
            print("✅ AVAudioSession ready | hardware rate: \(actualRate)Hz")

            let eng    = AVAudioEngine()
            let player = AVAudioPlayerNode()
            eng.attach(player)

            let mainMixer    = eng.mainMixerNode
            let hwOutputFmt  = mainMixer.outputFormat(forBus: 0)
            let hwRate       = hwOutputFmt.sampleRate
            
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

            var opusDesc = AudioStreamBasicDescription()
            opusDesc.mSampleRate       = 24000
            opusDesc.mFormatID         = kAudioFormatOpus
            opusDesc.mChannelsPerFrame = 1

            guard let opusFmt = AVAudioFormat(streamDescription: &opusDesc),
                  let opusConv = AVAudioConverter(from: opusFmt, to: opusPCMFormat) else {
                reject("INIT_ERROR", "Cannot create Opus AVAudioConverter", nil); return
            }
            self.opusConverter = opusConv

            if hwRate != 24000 {
                self.resampleConv = AVAudioConverter(from: opusPCMFormat, to: scheduleFormat)
            } else {
                self.resampleConv = nil
            }

            resolve("initialized")

        } catch {
            reject("INIT_ERROR", error.localizedDescription, error)
        }
    }

    // MARK: - Write Audio Frame (Array Accumulation Mode)
    @objc
    func writeAudioFrame(_ base64Data: String,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {

        guard let opusData = Data(base64Encoded: base64Data), opusData.count > 0 else {
            resolve("skipped-empty"); return
        }

        // 🚀 Add the separate envelope to the list
        self.opusChunks.append(opusData)
        self.accumulatedChunkCount += 1
        
        resolve("accumulated")
    }

    // MARK: - Process Accumulated Chunks (Call on stream_end)
    @objc(processAccumulatedAudio:rejecter:)
    func processAccumulatedAudio(_ resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {

        guard !self.opusChunks.isEmpty else {
            print("⚠️ [Accumulated] No data to process")
            resolve("no-data")
            return
        }

        guard let opusConv   = opusConverter,
              let hwFmt      = hardwareFormat,
              let engine     = engine,
              let player     = playerNode else {
            reject("STATE_ERROR", "Not initialized", nil); return
        }

        print("\n🎵 ═══════════════════════════════════════════════════════")
        print("🔄 DECODING \(self.opusChunks.count) CHUNKS RAPID-FIRE")
        print("═══════════════════════════════════════════════════════\n")

        DispatchQueue.global(qos: .userInteractive).async {
            do {
                // 🚀 THE FIX: Loop through the array and decode/schedule them one by one!
                // The AVAudioPlayerNode will automatically stitch them together seamlessly.
                var totalFrames: AVAudioFrameCount = 0
                
                for chunk in self.opusChunks {
                    // 1. Decode single envelope
                    let pcm24k = try self.decodeOpus(chunk, converter: opusConv)
                    
                    // 2. Resample if needed
                    let finalBuffer: AVAudioPCMBuffer
                    if let resamp = self.resampleConv {
                        finalBuffer = try self.resample(pcm24k, to: hwFmt, converter: resamp)
                    } else {
                        finalBuffer = pcm24k
                    }
                    
                    // 3. Queue to player
                    try self.schedule(finalBuffer, player: player, engine: engine)
                    totalFrames += finalBuffer.frameLength
                }
                
                let duration = Double(totalFrames) / hwFmt.sampleRate
                print("\n✅ AUDIO PIPELINE COMPLETE — Scheduled \(String(format: "%.2f", duration)) seconds of audio!")
                print("═══════════════════════════════════════════════════════\n")
                
                // Clear the array for the next question
                self.opusChunks.removeAll()
                self.accumulatedChunkCount = 0

                resolve("processed")

            } catch {
                print("❌ Pipeline Error: \(error.localizedDescription)\n")
                reject("AUDIO_ERROR", error.localizedDescription, error)
            }
        }
    }

    // MARK: - Decode Single Opus Frame (The exact 2880 fix from earlier)
    private func decodeOpus(_ opusData: Data,
                             converter: AVAudioConverter) throws -> AVAudioPCMBuffer {

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

        guard let pcmBuf = AVAudioPCMBuffer(pcmFormat: converter.outputFormat,
                                             frameCapacity: 2880) else {
            throw AudioErr.bufferFailed("output PCM 24kHz")
        }

        var inputConsumed = false
        var convError: NSError?

        let status = converter.convert(to: pcmBuf, error: &convError) { _, outStatus in
            if inputConsumed { outStatus.pointee = .noDataNow; return nil }
            inputConsumed = true
            outStatus.pointee = .haveData
            return compBuf
        }

        if let err = convError { throw AudioErr.converterFailed("Opus→PCM: \(err.localizedDescription)") }
        guard status != .error else { throw AudioErr.converterFailed("Opus decoder returned .error") }
        guard pcmBuf.frameLength > 0 else { throw AudioErr.emptyResult }
        return pcmBuf
    }

    // MARK: - Resample
    private func resample(_ input: AVAudioPCMBuffer,
                           to outFmt: AVAudioFormat,
                           converter: AVAudioConverter) throws -> AVAudioPCMBuffer {

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
        return outBuf
    }

    // MARK: - Schedule buffer
    private func schedule(_ buf: AVAudioPCMBuffer,
                           player: AVAudioPlayerNode,
                           engine: AVAudioEngine) throws {
        if !engine.isRunning { try engine.start() }

        player.scheduleBuffer(buf, completionHandler: nil)

        if !player.isPlaying {
            player.play()
        }
    }

    @objc(flushAudio:rejecter:)
    func flushAudio(_ resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve("flushed")
    }

    @objc func playWAVFile(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) { resolve("skipped") }

    @objc func stop(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        playerNode?.stop()
        self.opusChunks.removeAll()
        resolve("stopped")
    }
}

enum AudioErr: Error, LocalizedError {
    case bufferFailed(_ name: String), converterFailed(_ msg: String), emptyResult
}
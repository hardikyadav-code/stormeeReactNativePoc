// StormeeAudioModule.swift - WITH BETTER WAV FILE DETECTION

import Foundation
import AVFoundation
import AudioToolbox
import React

@objc(StormeeAudioModule)
class StormeeAudioModule: NSObject {

    private var audioEngine: AVAudioEngine?
    private var playerNode: AVAudioPlayerNode?
    private var converter: AudioConverterRef?
    private var format: AVAudioFormat?
    private var audioFile: AVAudioFile?

    @objc
    func initialize(_ resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {

        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default, options: [.duckOthers])
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
            
            print("✅ Audio session configured for playback")

            audioEngine = AVAudioEngine()
            playerNode = AVAudioPlayerNode()

            guard let engine = audioEngine,
                  let player = playerNode else {
                reject("INIT_ERROR", "Engine init failed", nil)
                return
            }

            engine.attach(player)

            format = AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: 24000,
                channels: 1,
                interleaved: false
            )

            engine.connect(player, to: engine.mainMixerNode, format: format)
            try engine.start()
            
            print("✅ Audio engine started")
            print("📊 Audio format: \(String(describing: format))")
            setupOpusConverter()
            resolve("initialized")

        } catch {
            print("❌ Initialization error: \(error)")
            reject("ENGINE_ERROR", "Audio engine failed: \(error.localizedDescription)", error)
        }
    }

    private func setupOpusConverter() {
        var inputFormat = AudioStreamBasicDescription()
        inputFormat.mSampleRate = 24000
        inputFormat.mFormatID = kAudioFormatOpus
        inputFormat.mChannelsPerFrame = 1
        inputFormat.mFramesPerPacket = 0

        var outputFormatDesc = AudioStreamBasicDescription()
        outputFormatDesc.mSampleRate = 24000
        outputFormatDesc.mFormatID = kAudioFormatLinearPCM
        outputFormatDesc.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked
        outputFormatDesc.mBitsPerChannel = 32
        outputFormatDesc.mChannelsPerFrame = 1
        outputFormatDesc.mFramesPerPacket = 1
        outputFormatDesc.mBytesPerFrame = 4
        outputFormatDesc.mBytesPerPacket = 4

        let status = AudioConverterNew(&inputFormat, &outputFormatDesc, &converter)
        if status != noErr {
            print("❌ Failed to create Opus converter:", status)
        } else {
            print("✅ Opus converter ready")
        }
    }

    // ✅ UPDATED: Better WAV file detection
    @objc
    func playWAVFile(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        print("🎵 [TEST] Attempting to play WAV file from bundle...")
        
        guard let engine = audioEngine,
              let playerNode = playerNode else {
            reject("ERROR", "Engine not ready", nil)
            return
        }
        
        do {
            // Try to find WAV file - list common names
            var wavURL: URL?
            
            // Try common names first
            let possibleNames = [
                "test",  // Most likely after renaming
                "audio",
                "sample",
                "693ff8790dec6629c2d92da4__online-video-cutter_com___1_"  // Original filename
            ]
            
            for name in possibleNames {
                if let url = Bundle.main.url(forResource: name, withExtension: "wav") {
                    wavURL = url
                    print("✅ Found WAV file: \(name).wav")
                    break
                }
            }
            
            // If still not found, list what's actually in the bundle
            guard let wavURL = wavURL else {
                print("❌ WAV file not found in bundle!")
                print("📂 Checking bundle contents...")
                
                if let resourcePath = Bundle.main.resourcePath {
                    let fileManager = FileManager.default
                    do {
                        let contents = try fileManager.contentsOfDirectory(atPath: resourcePath)
                        let wavFiles = contents.filter { $0.lowercased().hasSuffix(".wav") }
                        print("Found WAV files in bundle: \(wavFiles)")
                        
                        if wavFiles.isEmpty {
                            print("⚠️ No WAV files found! Please add a .wav file to Xcode:")
                            print("   1. Right-click project in Xcode")
                            print("   2. Select 'Add Files to AudioChatBotPoC'")
                            print("   3. Select your WAV file")
                            print("   4. Check 'Copy items if needed'")
                            print("   5. Check 'AudioChatBotPoC' target")
                            print("   6. Click 'Add'")
                        }
                    } catch {
                        print("Error reading bundle: \(error)")
                    }
                }
                
                reject("FILE_NOT_FOUND", "No WAV file found in bundle. Check Xcode console for instructions.", nil)
                return
            }
            
            print("📂 Found WAV file at: \(wavURL)")
            
            // Load WAV file
            let audioFile = try AVAudioFile(forReading: wavURL)
            self.audioFile = audioFile
            
            print("📊 WAV File loaded:")
            print("   Format: \(audioFile.processingFormat)")
            print("   Sample rate: \(audioFile.processingFormat.sampleRate)")
            print("   Channels: \(audioFile.processingFormat.channelCount)")
            print("   Length: \(audioFile.length) frames")
            
            // Make sure engine is running
            if !engine.isRunning {
                try engine.start()
                print("✅ Engine restarted")
            }
            
            // Start playback
            try playerNode.play()
            print("▶️ Player started")
            
            // Schedule entire file for playback
            try playerNode.scheduleFile(audioFile, at: nil)
            
            print("✅ WAV file scheduled for playback")
            print("▶️ Now playing: \(wavURL.lastPathComponent)")
            print("🔊 Listen to your simulator speaker!")
            
            resolve("playing")
            
        } catch {
            print("❌ Error playing WAV file: \(error)")
            reject("PLAY_ERROR", "Failed to play WAV: \(error.localizedDescription)", error)
        }
    }

    @objc
    func writeAudioFrame(_ base64Data: String,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {

        guard let opusFrameData = Data(base64Encoded: base64Data) else {
            reject("DECODE_ERROR", "Invalid base64", nil)
            return
        }

        guard let converter = converter,
              let playerNode = playerNode,
              let format = format,
              let engine = audioEngine else {
            reject("DECODE_ERROR", "Invalid state", nil)
            return
        }

        do {
            let (pcmData, decodedBytes) = try decodeOpusFrame(opusFrameData, converter: converter)

            if decodedBytes == 0 {
                print("⏭️ No audio decoded")
                resolve("skipped")
                return
            }

            let frameCount = decodedBytes / 4

            guard frameCount > 0 else {
                print("⏭️ Invalid frame count: \(frameCount)")
                resolve("skipped")
                return
            }

            guard let pcmBuffer = AVAudioPCMBuffer(
                pcmFormat: format,
                frameCapacity: AVAudioFrameCount(frameCount)
            ) else {
                reject("BUFFER_ERROR", "Buffer creation failed", nil)
                return
            }

            pcmBuffer.frameLength = AVAudioFrameCount(frameCount)

            let dataToUse = pcmData.prefix(Int(decodedBytes))
            dataToUse.withUnsafeBytes { rawPtr in
                if let baseAddress = rawPtr.baseAddress {
                    memcpy(pcmBuffer.floatChannelData![0],
                           baseAddress,
                           Int(decodedBytes))
                }
            }

            if engine.isRunning == false {
                try engine.start()
            }

            playerNode.scheduleBuffer(pcmBuffer, completionHandler: nil)

            if !playerNode.isPlaying {
                try playerNode.play()
                print("▶️ Audio playback started")
            }

            print("🎵 Scheduled audio buffer: \(frameCount) frames (\(decodedBytes) bytes)")
            resolve("played")

        } catch {
            print("❌ Error: \(error)")
            reject("DECODE_ERROR", "Opus decode failed", error)
        }
    }

    private func decodeOpusFrame(_ opusData: Data, converter: AudioConverterRef) throws -> (Data, UInt32) {
        let maxOutputFrames: UInt32 = 5760
        let maxOutputBytes = maxOutputFrames * 4

        var outputBuffer = Data(count: Int(maxOutputBytes))
        var decodedByteSize: UInt32 = 0

        let status = opusData.withUnsafeBytes { (inputPtr: UnsafeRawBufferPointer) -> OSStatus in
            return outputBuffer.withUnsafeMutableBytes { (outputPtr: UnsafeMutableRawBufferPointer) -> OSStatus in

                guard let inputBase = inputPtr.baseAddress else {
                    return -1
                }
                guard let outputBase = outputPtr.baseAddress else {
                    return -1
                }

                var inputBufferList = AudioBufferList(
                    mNumberBuffers: 1,
                    mBuffers: AudioBuffer(
                        mNumberChannels: 1,
                        mDataByteSize: UInt32(opusData.count),
                        mData: UnsafeMutableRawPointer(mutating: inputBase)
                    )
                )

                var outputBufferList = AudioBufferList(
                    mNumberBuffers: 1,
                    mBuffers: AudioBuffer(
                        mNumberChannels: 1,
                        mDataByteSize: UInt32(maxOutputBytes),
                        mData: outputBase
                    )
                )

                var numberInputPackets: UInt32 = 1

                let status = AudioConverterConvertComplexBuffer(
                    converter,
                    numberInputPackets,
                    &inputBufferList,
                    &outputBufferList
                )

                decodedByteSize = outputBufferList.mBuffers.mDataByteSize
                
                if status == noErr && decodedByteSize > 0 {
                    print("✅ Decoded \(decodedByteSize) bytes from Opus")
                }

                return status
            }
        }

        if status != noErr {
            print("❌ Opus decode failed: \(status)")
            throw NSError(domain: "AudioConverter", code: Int(status), userInfo: nil)
        }

        return (outputBuffer, decodedByteSize)
    }

    @objc
    func stop(_ resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {

        do {
            playerNode?.stop()
            try audioEngine?.stop()
            print("⏹️ Audio stopped")
            resolve("stopped")
        } catch {
            reject("STOP_ERROR", "Stop failed", error)
        }
    }
}

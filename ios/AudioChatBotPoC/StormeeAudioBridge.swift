import Foundation
import AVFoundation
import React

@objc(StormeeAudioBridge)
class StormeeAudioBridge: NSObject {

  private var engine: AVAudioEngine?
  private var playerNode: AVAudioPlayerNode?
  private var format: AVAudioFormat?

  @objc
  static func moduleName() -> String! {
    return "StormeeAudioBridge"
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override init() {
    super.init()
    NSLog("🎵 [StormeeAudioBridge] INIT CALLED")
    setupAudioEngine()
  }

  private func setupAudioEngine() {
    NSLog("🎵 [StormeeAudioBridge] setupAudioEngine() called")
    
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        NSLog("❌ [StormeeAudioBridge] setupAudioEngine - self is nil")
        return
      }
      
      do {
        NSLog("🎵 [StormeeAudioBridge] Configuring audio session...")
        
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(
          .playAndRecord,
          mode: .default,
          options: [.duckOthers, .defaultToSpeaker]
        )
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        
        NSLog("✅ [StormeeAudioBridge] Audio session configured")

        NSLog("🎵 [StormeeAudioBridge] Creating audio engine...")
        self.engine = AVAudioEngine()
        guard let engine = self.engine else {
          NSLog("❌ [StormeeAudioBridge] Failed to create engine")
          return
        }

        self.format = AVAudioFormat(
          standardFormatWithSampleRate: 24000,
          channels: 1
        )
        
        NSLog("✅ [StormeeAudioBridge] Format created: 24kHz, 1 channel")

        self.playerNode = AVAudioPlayerNode()
        guard let playerNode = self.playerNode, let format = self.format else {
          NSLog("❌ [StormeeAudioBridge] Failed to create player or format")
          return
        }

        engine.attach(playerNode)
        engine.connect(playerNode, to: engine.mainMixerNode, format: format)
        
        NSLog("✅ [StormeeAudioBridge] Player attached to engine")

        if !engine.isRunning {
          try engine.start()
          NSLog("✅ [StormeeAudioBridge] Audio engine started")
        }
      } catch {
        NSLog("❌ [StormeeAudioBridge] Setup error: %@", error.localizedDescription)
      }
    }
  }

  @objc(initialize:resolver:rejecter:)
  func initialize(
    config: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    NSLog("🎵 [StormeeAudioBridge] initialize() called with config: %@", config)
    
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        NSLog("❌ [StormeeAudioBridge] initialize - self is nil")
        reject("ERROR", "Self deallocated", nil)
        return
      }

      do {
        let sampleRate = config["sampleRate"] as? Double ?? 24000
        let channels = config["channels"] as? AVAudioChannelCount ?? 1

        self.format = AVAudioFormat(
          standardFormatWithSampleRate: sampleRate,
          channels: channels
        )
        
        NSLog("✅ [StormeeAudioBridge] Format updated: %.0f Hz, %u channels", sampleRate, channels)

        try AVAudioSession.sharedInstance().setActive(true)

        resolve(["status": "initialized"])
      } catch {
        NSLog("❌ [StormeeAudioBridge] initialize error: %@", error.localizedDescription)
        reject("ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc(startPlayback:rejecter:)
  func startPlayback(
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    NSLog("▶️ [StormeeAudioBridge] startPlayback() called")
    
    DispatchQueue.main.async { [weak self] in
      guard let playerNode = self?.playerNode else {
        NSLog("❌ [StormeeAudioBridge] startPlayback - no playerNode")
        reject("ERROR", "Not initialized", nil)
        return
      }

      if !playerNode.isPlaying {
        playerNode.play()
        NSLog("▶️ [StormeeAudioBridge] Player started")
      } else {
        NSLog("ℹ️ [StormeeAudioBridge] Player already playing")
      }

      resolve(["status": "playing"])
    }
  }

  @objc(stopPlayback:rejecter:)
  func stopPlayback(
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    NSLog("⏹️ [StormeeAudioBridge] stopPlayback() called")
    
    DispatchQueue.main.async { [weak self] in
      guard let playerNode = self?.playerNode else {
        NSLog("❌ [StormeeAudioBridge] stopPlayback - no playerNode")
        reject("ERROR", "Not initialized", nil)
        return
      }

      if playerNode.isPlaying {
        playerNode.stop()
        NSLog("⏹️ [StormeeAudioBridge] Player stopped")
      }

      resolve(["status": "stopped"])
    }
  }

  @objc(writeAudioFrame:resolver:rejecter:)
  func writeAudioFrame(
    base64Data: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        NSLog("❌ [StormeeAudioBridge] writeAudioFrame - self is nil")
        reject("ERROR", "Self deallocated", nil)
        return
      }

      do {
        guard let rawData = Data(base64Encoded: base64Data) else {
          NSLog("❌ [StormeeAudioBridge] Invalid base64 data")
          reject("DECODE_ERROR", "Invalid base64", nil)
          return
        }

        guard let format = self.format,
              let playerNode = self.playerNode else {
          NSLog("❌ [StormeeAudioBridge] Not initialized (no format or playerNode)")
          reject("STATE_ERROR", "Not initialized", nil)
          return
        }

        let frameCapacity = UInt32(rawData.count / 2)
        
        NSLog("📝 [StormeeAudioBridge] writeAudioFrame: %u frames", frameCapacity)

        guard let audioBuffer = AVAudioPCMBuffer(
          pcmFormat: format,
          frameCapacity: frameCapacity
        ) else {
          NSLog("❌ [StormeeAudioBridge] Failed to create buffer")
          reject("BUFFER_ERROR", "Failed to create buffer", nil)
          return
        }

        audioBuffer.frameLength = frameCapacity

        // Convert Int16 to Float32
        rawData.withUnsafeBytes { rawBytes in
          let int16Ptr = rawBytes.bindMemory(to: Int16.self)
          let floatChannelData = audioBuffer.floatChannelData![0]

          for frame in 0..<Int(frameCapacity) {
            let int16Sample = int16Ptr[frame]
            floatChannelData[frame] = Float(int16Sample) / 32768.0
          }
        }
        
        NSLog("✅ [StormeeAudioBridge] Converted %u Int16 frames to Float32", frameCapacity)

        // Schedule buffer
        playerNode.scheduleBuffer(audioBuffer, completionHandler: nil)
        
        NSLog("✅ [StormeeAudioBridge] Buffer scheduled for playback")

        // Start playback if not already playing
        if !playerNode.isPlaying {
          playerNode.play()
          NSLog("🔊 [StormeeAudioBridge] PLAYBACK STARTED! 🎵")
        }

        resolve([
          "status": "frame_written",
          "frames": frameCapacity
        ])
      } catch {
        NSLog("❌ [StormeeAudioBridge] writeAudioFrame error: %@", error.localizedDescription)
        reject("ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc(getPlaybackMetrics:rejecter:)
  func getPlaybackMetrics(
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        reject("ERROR", "Self deallocated", nil)
        return
      }

      resolve([
        "isPlaying": self.playerNode?.isPlaying ?? false,
        "sampleRate": Int(self.format?.sampleRate ?? 0),
        "channels": Int(self.format?.channelCount ?? 0)
      ])
    }
  }

  @objc(terminate:rejecter:)
  func terminate(
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    NSLog("🛑 [StormeeAudioBridge] terminate() called")
    
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        NSLog("❌ [StormeeAudioBridge] terminate - self is nil")
        reject("ERROR", "Self deallocated", nil)
        return
      }

      do {
        if let playerNode = self.playerNode, playerNode.isPlaying {
          playerNode.stop()
          NSLog("⏹️ [StormeeAudioBridge] Player stopped in terminate")
        }

        if let engine = self.engine, engine.isRunning {
          try engine.stop()
          NSLog("⏹️ [StormeeAudioBridge] Engine stopped in terminate")
        }

        resolve(["status": "terminated"])
      } catch {
        NSLog("❌ [StormeeAudioBridge] terminate error: %@", error.localizedDescription)
        reject("ERROR", error.localizedDescription, error)
      }
    }
  }
}
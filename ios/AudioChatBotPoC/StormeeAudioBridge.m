//
//  StormeeAudioBridge.m
//  AudioChatBotPoC
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(StormeeAudioModule, NSObject)

RCT_EXTERN_METHOD(initialize:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(writeAudioFrame:(NSString *)base64Data
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

// Dummy implementation to satisfy the linker
@implementation StormeeAudioBridge
@end
YouTube Playables documentation
Guides and requirements for building and preparing games for YouTube Playables.
Updated 8/21/2026, 2:25:20 PM

Getting started

Reference

Certification requirements

Samples

YouTube Playables SDK is a web SDK for connecting web games with the YouTube environment. The SDK features a robust API to support games in a variety of ways to create an excellent gaming experience on YouTube.
Add the Playables SDK to your game

A game should have an index.html file in the root directory. Import the YouTube Playables SDK by adding this line before any of your game code:

<script src="https://www.youtube.com/game_api/v1"></script>

The SDK runs as a no-op when your game is served locally. To verify SDK integration correctness, use the McPlay.
Integrate with Playables SDK

There are several required and optional integrations with the Playables SDK.
Required integrations

Review the publishing requirements overall, with a focus on integration requirements. Review the Playables SDK reference for implementation details.

Examples include:

    ytgame.game.firstFrameReady()
    ytgame.game.gameReady()
    ytgame.IN_PLAYABLES_ENV
    ytgame.system.isAudioEnabled()
    ytgame.system.onAudioEnabledChange((isAudioEnabled) => {})
    ytgame.system.onPause(() => {})
    ytgame.system.onResume(() => {})
    ytgame.game.loadData()
    ytgame.game.saveData(data)

Recommended integrations

In addition to the required integrations, several other functions are available to create a highly engaging experience. Examples include:

    ytgame.system.getLanguage() - Use this to retrieve the user's current locale setting. Don't use other functions or store the language in the cloud save, as this may change at any time.
    ytgame.engagement.sendScore({ value: newScore }) - Send a best score to YouTube to display.
    ytgame.engagement.openYTContent({ id: videoID }) - Open a YouTube video.
    ytgame.health.logError() and ytgame.health.logWarning() - Log issues to YouTube.
    ytgame.ads.requestInterstitialAd() and requestRewardedAd(rewardId: string) - Integrate ads features into your game.

Review the Playables SDK reference for implementation details and additional functions.
TypeScript type definitions

For games using TypeScript, use the following type definitions:

/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * The top-level namespace for the YouTube Playables SDK.
 *
 * This is a globally scoped variable in the current window. You **MUST NOT**
 * override this variable.
 *
 */
declare namespace ytgame {
  /**
   * The types of errors that the YouTube Playables SDK throws.
   */
  export const enum SdkErrorType {
    /**
     * The error type is unknown.
     */
    UNKNOWN,
    /**
     * The API was temporarily unavailable.
     *
     * Ask players to retry at a later time if they are in a critical flow.
     */
    API_UNAVAILABLE,
    /**
     * The API was called with invalid parameters.
     */
    INVALID_PARAMS,
    /**
     * The API was called with parameters exceeding the size limit.
     */
    SIZE_LIMIT_EXCEEDED,
  }

  /**
   * The error object that the YouTube Playables SDK throws.
   *
   * The `SdkError` object is a child of
   * [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/Error)
   * and contains an additional field.
   */
  export class SdkError extends Error {
    /**
     * The type of the error.
     */
    errorType: SdkErrorType;
  }

  /**
   * The YouTube Playables SDK version.
   *
   * @example
   * ```ts
   * // Prints the SDK version to console. Do not do this in production.
   * console.log(ytgame.SDK_VERSION);
   * ```
   */
  export const SDK_VERSION: string;

  /**
   * Whether or not the game is running within the Playables environment.
   * You can use this to determine whether to enable or disable features that
   * are only available inside of Playables. Combine this check with checking
   * for `ytgame` to ensure that the SDK is actually loaded.
   *
   * @example
   * ```ts
   * const inPlayablesEnv = (typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV);
   * ```
   *
   * @example
   * ```ts
   * // An example of where you may want to fork behavior for saving data.
   * if (ytgame?.IN_PLAYABLES_ENV) {
   *   ytgame.game.saveData(dataStr);
   * } else {
   *   window.localStorage.setItem('SAVE_DATA', dataStr);
   * }
   * ```
   */
  export const IN_PLAYABLES_ENV: boolean;
}

/**
 * The functions and properties related to ads.
 */
declare namespace ytgame.ads {
  /**
   * Requests an interstitial ad to be shown.
   *
   * Makes no guarantees about whether the ad was shown.
   * Do not use this API to reward players for watching an ad.
   *
   * @example
   * ```ts
   * try {
   *   await ytgame.ads.requestInterstitialAd();
   *   // Ad request successful, do something else.
   * } catch (error) {
   *   // Handle errors, retry logic, etc.
   *   // Note that error may be undefined.
   * }
   * ```
   *
   * @returns a promise that resolves on a successful request or
   * rejects/throws on an unsuccessful request.
   * @throws `ytgame.SdkError`
   */
  export function requestInterstitialAd(): Promise<void>;

  /**
   * Requests a rewarded ad to be shown for a particular reward type.
   *
   * Makes no guarantees about whether the ad was shown.
   *
   * @example
   * ```ts
   * try {
   *   const isRewardEarned = await ytgame.ads.requestRewardedAd('reward-123');
   *   // Handle reward being earned or not.
   * } catch (error) {
   *   // Handle errors, retry logic, etc.
   *   // Note that error may be undefined.
   * }
   * ```
   *
   * @param rewardId Required. An identifier which uniquely identifies the
   * claimable reward type. You must use a unique ID for each type of reward,
   * and re-use that same ID each time that specific reward type is offered.
   * For example, you could make the ID readable or a UUID. You can include this
   * as a hard-coded ID in your game code for the specific reward. Our only
   * requirements are that you provide an ID and that it not contain any user
   * data. For example:
   * - 100-coins-reward-12 - "100 coins"
   * - 7defcfa2-4312-4893-a13a-a84e0c47a4df - "3 lives"
   * - 121b001a-0c25-4289-88f6-58e3620d938f - "Skip level"
   * @returns A promise that resolves on a successful request with value true if
   * the user met the conditions to receive a reward, or false if they did not.
   * The promise rejects/throws on an unsuccessful request.
   * @throws `ytgame.SdkError`
   */
  export function requestRewardedAd(rewardId: string): Promise<boolean>;

  /**
   * Scheduled for removal.
   * @hidden
   */
  export const enum AdResult {
    UNKNOWN,
    SHOWED,
    DISMISSED,
    REJECTED,
  }

  /**
   * Scheduled for removal.
   * Use requestInterstitialAd instead.
   * @hidden
   *
   * @throws {ytgame.SdkError} Will throw an error if the ad fails to load.
   */
  export function requestAd(): Promise<AdResult>;
}

/**
 * The functions and properties related to player engagement.
 */
declare namespace ytgame.engagement {
  /**
   * The score object the game sends to YouTube.
   */
  export interface Score {
    /**
     * The score value expressed as an integer. The score must be less
     * than or equal to the
     * [maximum safe integer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER).
     * Otherwise, the score will be rejected.
     */
    value: number;
  }

  /**
   * Sends a score to YouTube.
   *
   * The score should represent one dimension of progress within the game.
   * If there are multiple dimensions, the developer must choose one dimension
   * to be consistent. Scores will be sorted and the highest score will be
   * displayed in YouTube UI so any in-game high score UI should align with
   * what is being sent through this API.
   *
   * @example
   * ```ts
   * async function onScoreAwarded(score: number) {
   *   try {
   *     await ytgame.engagement.sendScore({value: score});
   *     // Score sent successfully, do something else.
   *   } catch (error) {
   *     // Handle errors, retry logic, etc.
   *     // Note that error may be undefined.
   *   }
   * }
   * ```
   *
   * @param score - the score to send to YouTube.
   * @returns a Promise that resolves when succeeded and rejects/throws with an
   * `ytgame.SdkError` when failed.
   * @throws `ytgame.SdkError`
   */
  export function sendScore(score: Score): Promise<void>;

  /**
   * The possible types of content.
   */
  export const enum ContentType {
    /**
     * A YouTube video.
     */
    VIDEO,
    /**
     * A YouTube Playable.
     */
    PLAYABLE,
  }

  /**
   * The content object the game sends to YouTube.
   */
  export interface Content {
    /**
     * The ID of the content we want to open.
     */
    id: string;
    /**
     * The type of content to open.
     * Should be provided, but if not provided, `VIDEO` will be assumed.
     */
    contentType?: ContentType;
  }

  /**
   * Requests YouTube to open content corresponding to the provided content ID.
   *
   * Generally, this will open the content in a new tab on web. On mobile, a
   * video will open in the mini player and a Playable will replace the
   * currently open Playable.
   *
   * @example
   * ```ts
   * // Open a video.
   * async function showVideo(videoID: string) {
   *   try {
   *     await ytgame.engagement.openYTContent({
   *       id: videoID,
   *       contentType: ytgame.engagement.ContentType.VIDEO,
   *     });
   *     // Request successful, content may have opened.
   *   } catch (error) {
   *     // Handle errors, retry logic, etc.
   *     // Note that error may be undefined.
   *   }
   * }
   *
   * // Open a Playable.
   * async function openDifferentPlayable(playableID: string) {
   *   try {
   *     await ytgame.engagement.openYTContent({
   *       id: playableID,
   *       contentType: ytgame.engagement.ContentType.PLAYABLE,
   *     });
   *     // Request successful, content may have opened.
   *     // On mobile, the new Playable will replace the current one.
   *   } catch (error) {
   *     // Handle errors, retry logic, etc.
   *     // Note that error may be undefined.
   *   }
   * }
   * ```
   *
   * @param content - the content to open on YouTube.
   * @returns a Promise that resolves when succeeded and rejects/throws with an
   * `ytgame.SdkError` when failed.
   * @throws `ytgame.SdkError`
   * Throws `INVALID_PARAMS` if the content ID is invalid.
   */
  export function openYTContent(content: Content): Promise<void>;
}

/**
 * The functions and properties related to generic game behaviors.
 */
declare namespace ytgame.game {
  /**
   * Notifies YouTube that the game has begun showing frames.
   *
   * The game **MUST** call this API. Otherwise, the game is not shown to
   * users. `firstFrameReady()` **MUST** be called before `gameReady()`.
   *
   * @example
   * ```ts
   * function onGameInitialized() {
   *   ytgame.game.firstFrameReady();
   * }
   * ```
   */
  export function firstFrameReady(): void;

  /**
   * Notifies YouTube that the game is ready for players to interact with.
   *
   * The game **MUST** call this API when it is interactable.
   * The game **MUST NOT** call this API when a loading screen is still shown.
   * Otherwise, the game fails the YouTube certification process.
   *
   * @example
   * ```ts
   * function onGameInteractable() {
   *   ytgame.game.gameReady();
   * }
   * ```
   */
  export function gameReady(): void;

  /**
   * Loads game data from YouTube in the form of a serialized string.
   *
   * The game **must** handle any parsing between the string and an
   * internal format.
   *
   * @example
   * ```ts
   * async function gameSetup() {
   *   try {
   *     const data = await ytgame.game.loadData();
   *     // Load succeeded, do something with data.
   *   } catch (error) {
   *     // Handle errors, retry logic, etc.
   *     // Note that error may be undefined.
   *   }
   * }
   * ```
   *
   * @returns a Promise that completes when loading succeeded and rejects with an
   * `ytgame.SdkError` when failed.
   */
  export function loadData(): Promise<string>;

  /**
   * Saves game data to the YouTube in the form of a serialized string.
   *
   * The string **must** be a valid, well-formed UTF-16 string and a maximum of
   * 3 MiB. The game **must** handle any parsing between the string and an
   * internal format. If necessary, use `String.isWellFormed()` to check if the
   * string is well-formed.
   *
   * @example
   * ```ts
   * async function saveGame() {
   *   try {
   *     ytgame.game.saveData(JSON.stringify(gameSave));
   *     // Save succeeded.
   *   } catch (error) {
   *     // Handle errors, retry logic, etc.
   *     // Note that error may be undefined.
   *   }
   * }
   * ```
   *
   * @returns a Promise that resolves when saving succeeded and rejects with an
   * `ytgame.SdkError` when failed.
   */
  export function saveData(data: string): Promise<void>;

  /**
   * @hidden
   * Triggers YouTube to prompt the user to share an invite code. If the user
   * chooses to share, the invite code will be included in the shared URL.
   *
   * 🧪 PRIVATE PREVIEW API: SUBJECT TO CHANGE WITHOUT NOTICE.
   *
   * Invite codes must be valid UTF-8 and must be a maximum of 8 bytes.
   *
   * See https://developer.mozilla.org/en-US/docs/Glossary/UTF-8 for
   * details on number of bytes for UTF-8 characters.
   *
   * @returns a Promise that resolves when succeeded and rejects/throws with an
   * `ytgame.SdkError` when failed.
   * @throws `ytgame.SdkError`
   */
  export function shareInviteCode(inviteCode: string): Promise<void>;

  /**
   * @hidden
   * An object used to pass game-related data from YouTube to the game.
   *
   * 🧪 PRIVATE PREVIEW API: SUBJECT TO CHANGE WITHOUT NOTICE.
   */
  export interface GameData {
    /**
     * @hidden
     * Get the invite code that was shared with the user.
     *
     * 🧪 PRIVATE PREVIEW API: SUBJECT TO CHANGE WITHOUT NOTICE.
     *
     * @returns the invite code that was shared with the user.
     */
    getInviteCode: () => string;
    /**
     * @hidden
     * Check if an invite code was shared with the user.
     *
     * 🧪 PRIVATE PREVIEW API: SUBJECT TO CHANGE WITHOUT NOTICE.
     *
     * @returns true if the invite code was shared with the user.
     */
    hasInviteCode: () => boolean;
  }

  /**
   * @hidden
   * Sets a callback to be triggered when game data becomes available from
   * YouTube. This callback can be triggered at any time.
   *
   * 🧪 PRIVATE PREVIEW API: SUBJECT TO CHANGE WITHOUT NOTICE.
   *
   * @param callback - the callback function to be triggered.
   * @returns a function to unset the callback that is usually unused.
   */
  export function onGameDataAvailable(
    callback: (gameData: GameData) => void,
  ): VoidFunction;
}

/**
 * The functions and properties related to the game health.
 */
declare namespace ytgame.health {
  /**
   * Logs an error to YouTube.
   *
   * **Note:** This API is best-effort and rate-limited which can result in data
   * loss.
   *
   * @example
   * ```ts
   * function onError() {
   *   ytgame.health.logError();
   * }
   * ```
   */
  export function logError(): void;
  /**
   * Logs a warning to YouTube.
   *
   * **Note:** This API is best-effort and rate-limited which can result in data
   * loss.
   *
   * @example
   * ```ts
   * function onWarning() {
   *   ytgame.health.logWarning();
   * }
   * ```
   */
  export function logWarning(): void;
}

/**
 * The functions and properties related to the YouTube system.
 */
declare namespace ytgame.system {
  /**
   * Returns whether the game audio is enabled in the YouTube settings.
   *
   * The game **SHOULD** use this to initialize the game audio state.
   *
   * @example
   * ```ts
   * function initGameSound() {
   *   if (ytgame.system.isAudioEnabled()) {
   *     // Enable game audio.
   *   } else {
   *     // Disable game audio.
   *   }
   * }
   * ```
   *
   * @returns a boolean indicating whether the audio is enabled.
   */
  export function isAudioEnabled(): boolean;

  /**
   * Sets a callback to be triggered when the audio settings change event is
   * fired from YouTube.
   *
   * The game **MUST** use this API to update the game audio state.
   *
   * @example
   * ```ts
   * ytgame.system.onAudioEnabledChange((isAudioEnabled) => {
   *   if (isAudioEnabled) {
   *     // Enable game audio.
   *   } else {
   *     // Disable game audio.
   *   }
   * });
   * ```
   *
   * @param callback - the callback function to be triggered.
   * @returns a function to unset the callback that is usually unused.
   *
   */
  export function onAudioEnabledChange(
    callback: (isAudioEnabled: boolean) => void,
  ): () => void;

  /**
   * Sets a callback to be triggered when a pause game event is fired from
   * YouTube. The game has a short window to save any state before it is
   * evicted.
   *
   * onPause is called for all types of pauses, including when the user exits
   * the game. There is no guarantee that the game will resume.
   *
   * @example
   * ```ts
   * ytgame.system.onPause(() => {
   *   pauseGame();
   * });
   *
   * function pauseGame() {
   *   // Logic to pause game state.
   * }
   * ```
   *
   * @param callback - the callback function to be triggered.
   * @returns a function to unset the callback that is usually unused.
   */
  export function onPause(callback: () => void): () => void;

  /**
   * Sets a callback to be triggered when a resume game event is fired from
   * YouTube.
   *
   * After being paused, the game is not guaranteed to resume.
   *
   * @example
   * ```ts
   * ytgame.system.onResume(() => {
   *   resumeGame();
   * });
   *
   * function resumeGame() {
   *   // Logic to resume game state.
   * }
   * ```
   *
   * @param callback - the callback function to be triggered.
   * @returns a function to unset the callback that is usually unused.
   */
  export function onResume(callback: () => void): () => void;

  /**
   * Returns the language that is set in the user's YouTube settings in the
   * form of a
   * [BCP-47 language tag](https://www.rfc-editor.org/info/bcp47).
   *
   * Do not use other functions to determine the user's language or locale, or
   * store their language preference in the cloud save. Instead, use this
   * function to ensure that the user experience is consistent across YouTube.
   *
   * @example
   * ```ts
   * const localeTag = await ytgame.system.getLanguage();
   * // `localeTag` is now set to something like "en-US" or "es-419".
   * ```
   *
   * @returns a Promise that completes when getting the language succeeded and
   * rejects with an `ytgame.SdkError` when failed.
   * @throws `ytgame.SdkError`
   */
  export function getLanguage(): Promise<string>;
}

Sample games

Samples are available that demonstrate how to integrate with YouTube Playables SDK, including plain JavaScript, Flutter web, Godot, and Unity.
Test your game with the McPlay

Once you are ready, you can validate your integration using the McPlay. To learn how, follow the McPlay.


Page Summary

    The YouTube Playables SDK is a web SDK that enables HTML5 games to integrate with the YouTube environment, providing a robust API for various gaming functionalities.

    To use the SDK, games must include an index.html file and import the SDK via a specific script tag, ensuring the SDK is loaded before any game code, with a McPlay available for integration verification.

    Games must call firstFrameReady() and then gameReady() to signal that the game is ready to be displayed and interacted with, respectively, which are critical steps for the game to function on YouTube.

    The SDK offers APIs for player engagement, allowing games to send scores via sendScore() and open YouTube videos using openYTContent(), enhancing the player experience.

    The SDK provides functions to manage game data, such as loadData() and saveData(), and to handle game health and system interactions, including logging errors/warnings and managing audio/pause/resume states.

ytgame

The top-level namespace for the YouTube Playables SDK.

This is a globally scoped variable in the current window. You MUST NOT override this variable.
Namespaces
ads	
The functions and properties related to ads.
engagement	
The functions and properties related to player engagement.
game	
The functions and properties related to generic game behaviors.
health	
The functions and properties related to the game health.
system	
The functions and properties related to the YouTube system.
Enumerations
SdkErrorType	
The types of errors that the YouTube Playables SDK throws.
Classes
SdkError	
The error object that the YouTube Playables SDK throws.
Variables
IN_PLAYABLES_ENV	
Whether or not the game is running within the Playables environment.
SDK_VERSION	
The YouTube Playables SDK version.
Enumerations
Const SdkErrorType

SdkErrorType

The types of errors that the YouTube Playables SDK throws.
Enumeration Members
API_UNAVAILABLE	
The API was temporarily unavailable.

Ask players to retry at a later time if they are in a critical flow.
INVALID_PARAMS	
The API was called with invalid parameters.
SIZE_LIMIT_EXCEEDED	
The API was called with parameters exceeding the size limit.
UNKNOWN	
The error type is unknown.
Variables
Const IN_PLAYABLES_ENV

IN_PLAYABLES_ENV: boolean

Whether or not the game is running within the Playables environment. You can use this to determine whether to enable or disable features that are only available inside of Playables. Combine this check with checking for ytgame to ensure that the SDK is actually loaded.

Example

const inPlayablesEnv \= typeof ytgame !== "undefined" && ytgame.IN\_PLAYABLES\_ENV;

// An example of where you may want to fork behavior for saving data.
if (ytgame?.IN\_PLAYABLES\_ENV) {
  ytgame.game.saveData(dataStr);
} else {
  window.localStorage.setItem("SAVE\_DATA", dataStr);
}

Const SDK_VERSION

SDK_VERSION: string

The YouTube Playables SDK version.

Example

// Prints the SDK version to console. Do not do this in production.
console.log(ytgame.SDK\_VERSION);

ytgame.SdkError

subdirectory_arrow_rightExtends Error

The error object that the YouTube Playables SDK throws.

The SdkError object is a child of Error and contains an additional field.
Constructors
constructor	
Properties
errorType	
The type of the error.
message	
name	
stack?	
Properties
errorType

errorType: [SdkErrorType](/youtube/gaming/playables/reference/sdk#ytgame.SdkErrorType)

The type of the error.
ytgame.ads

The functions and properties related to ads.
Functions
requestInterstitialAd	
Requests an interstitial ad to be shown.
requestRewardedAd	
Requests a rewarded ad to be shown for a particular reward type.
Functions
requestInterstitialAd

requestInterstitialAd(): Promise<void>

Requests an interstitial ad to be shown.

Makes no guarantees about whether the ad was shown. Do not use this API to reward players for watching an ad.

Example

try {
  await ytgame.ads.requestInterstitialAd();
  // Ad request successful, do something else.
} catch (error) {
  // Handle errors, retry logic, etc.
  // Note that error may be undefined.
}

Returns
Promise<void>	a promise that resolves on a successful request or rejects/throws on an unsuccessful request.
requestRewardedAd

requestRewardedAd(rewardId: string): Promise<boolean>

Requests a rewarded ad to be shown for a particular reward type.

Makes no guarantees about whether the ad was shown.

Example

try {
  const isRewardEarned \= await ytgame.ads.requestRewardedAd("reward-123");
  // Handle reward being earned or not.
} catch (error) {
  // Handle errors, retry logic, etc.
  // Note that error may be undefined.
}

Parameters
rewardId: string	Required. An identifier which uniquely identifies the claimable reward type. You must use a unique ID for each type of reward, and re-use that same ID each time that specific reward type is offered. For example, you could make the ID readable or a UUID. You can include this as a hard-coded ID in your game code for the specific reward. Our only requirements are that you provide an ID and that it not contain any user data. For example:

    100-coins-reward-12 - "100 coins"
    7defcfa2-4312-4893-a13a-a84e0c47a4df - "3 lives"
    121b001a-0c25-4289-88f6-58e3620d938f - "Skip level"

Returns
Promise<boolean>	A promise that resolves on a successful request with value true if the user met the conditions to receive a reward, or false if they did not. The promise rejects/throws on an unsuccessful request.

If the requestRewardedAd method is not present in your version of the YTGameWrapper.cs script, you must implement it yourself to access this functionality. The provided Unity Wrapper is an experimental sample and does not contain the full list of available SDK APIs.

To implement this, you will need to:

    Update the .jslib plugin: Add a JavaScript bridge function that calls ytgame.ads.requestRewardedAd(rewardId).
    Update YTGameWrapper.cs: Add a C# method that uses [DllImport("__Internal")] to call your new .jslib function.

Key Details for Implementation:

    API Reference: The requestRewardedAd method requires a rewardId (string) and returns a Promise<boolean>. Status: Rewarded ads are currently a Public Preview API and are subject to change. They are also noted as being in active development.
    Handling Results: Your implementation must gracefully handle cases where an ad is not available. If the request fails or is rejected, the promise will reject or return false. You must not award in-game items unless the ad is successfully shown and the reward is earned.

For the complete list of available APIs to include in your wrapper, refer to the official SDK documentation.
ytgame.engagement

The functions and properties related to player engagement.
Enumerations
ContentType	
The possible types of content.
Interfaces
Content	
The content object the game sends to YouTube.
Score	
The score object the game sends to YouTube.
Functions
openYTContent	
Requests YouTube to open content corresponding to the provided content ID.
sendScore	
Sends a score to YouTube.
Enumerations
Const ContentType

ContentType

The possible types of content.
Enumeration Members
PLAYABLE	
A YouTube Playable.
VIDEO	
A YouTube video.
Functions
openYTContent

openYTContent(content: [Content](/youtube/gaming/playables/reference/sdk#ytgame.engagement.Content)): Promise<void>

Requests YouTube to open content corresponding to the provided content ID.

Generally, this will open the content in a new tab on web. On mobile, a video will open in the mini player and a Playable will replace the currently open Playable.

Example

// Open a video.
async function showVideo(videoID: string) {
  try {
    await ytgame.engagement.openYTContent({
      id: videoID,
      contentType: ytgame.engagement.ContentType.VIDEO,
    });
    // Request successful, content may have opened.
  } catch (error) {
    // Handle errors, retry logic, etc.
    // Note that error may be undefined.
  }
}

// Open a Playable.
async function openDifferentPlayable(playableID: string) {
  try {
    await ytgame.engagement.openYTContent({
      id: playableID,
      contentType: ytgame.engagement.ContentType.PLAYABLE,
    });
    // Request successful, content may have opened.
    // On mobile, the new Playable will replace the current one.
  } catch (error) {
    // Handle errors, retry logic, etc.
    // Note that error may be undefined.
  }
}

Parameters
content: Content	the content to open on YouTube.
Returns
Promise<void>	a Promise that resolves when succeeded and rejects/throws with an ytgame.SdkError when failed.
sendScore

sendScore(score: [Score](/youtube/gaming/playables/reference/sdk#ytgame.engagement.Score)): Promise<void>

Sends a score to YouTube.

The score should represent one dimension of progress within the game. If there are multiple dimensions, the developer must choose one dimension to be consistent. Scores will be sorted and the highest score will be displayed in YouTube UI so any in-game high score UI should align with what is being sent through this API.

Example

async function onScoreAwarded(score: number) {
  try {
    await ytgame.engagement.sendScore({ value: score });
    // Score sent successfully, do something else.
  } catch (error) {
    // Handle errors, retry logic, etc.
    // Note that error may be undefined.
  }
}

Parameters
score: Score	the score to send to YouTube.
Returns
Promise<void>	a Promise that resolves when succeeded and rejects/throws with an ytgame.SdkError when failed.
ytgame.engagement.Content

The content object the game sends to YouTube.
Properties
contentType?	
The type of content to open.
id	
The ID of the content we want to open.
Properties
Optional contentType

contentType?: [ContentType](/youtube/gaming/playables/reference/sdk#ytgame.engagement.ContentType)

The type of content to open. Should be provided, but if not provided, VIDEO will be assumed.
id

id: string

The ID of the content we want to open.
ytgame.engagement.Score

The score object the game sends to YouTube.
Properties
value	
The score value expressed as an integer.
Properties
value

value: number

The score value expressed as an integer. The score must be less than or equal to the maximum safe integer. Otherwise, the score will be rejected.
ytgame.game

The functions and properties related to generic game behaviors.
Functions
firstFrameReady	
Notifies YouTube that the game has begun showing frames.
gameReady	
Notifies YouTube that the game is ready for players to interact with.
loadData	
Loads game data from YouTube in the form of a serialized string.
saveData	
Saves game data to the YouTube in the form of a serialized string.
Functions
firstFrameReady

firstFrameReady(): void

Notifies YouTube that the game has begun showing frames.

The game MUST call this API. Otherwise, the game is not shown to users. firstFrameReady() MUST be called before gameReady().

Example

function onGameInitialized() {
  ytgame.game.firstFrameReady();
}

gameReady

gameReady(): void

Notifies YouTube that the game is ready for players to interact with.

The game MUST call this API when it is interactable. The game MUST NOT call this API when a loading screen is still shown. Otherwise, the game fails the YouTube certification process.

Example

function onGameInteractable() {
  ytgame.game.gameReady();
}

loadData

loadData(): Promise<string>

Loads game data from YouTube in the form of a serialized string.

The game must handle any parsing between the string and an internal format.

Example

async function gameSetup() {
  try {
    const data \= await ytgame.game.loadData();
    // Load succeeded, do something with data.
  } catch (error) {
    // Handle errors, retry logic, etc.
    // Note that error may be undefined.
  }
}

Returns
Promise<string>	a Promise that completes when loading succeeded and rejects with an ytgame.SdkError when failed.
saveData

saveData(data: string): Promise<void>

Saves game data to the YouTube in the form of a serialized string.

The string must be a valid, well-formed UTF-16 string and a maximum of 3 MiB. The game must handle any parsing between the string and an internal format. If necessary, use String.isWellFormed() to check if the string is well-formed.

Example

async function saveGame() {
  try {
    ytgame.game.saveData(JSON.stringify(gameSave));
    // Save succeeded.
  } catch (error) {
    // Handle errors, retry logic, etc.
    // Note that error may be undefined.
  }
}

Parameters
data: string	
Returns
Promise<void>	a Promise that resolves when saving succeeded and rejects with an ytgame.SdkError when failed.
ytgame.health

The functions and properties related to the game health.
Functions
logError	
Logs an error to YouTube.
logWarning	
Logs a warning to YouTube.
Functions
logError

logError(): void

Logs an error to YouTube.

Note: This API is best-effort and rate-limited which can result in data loss.

Example

function onError() {
  ytgame.health.logError();
}

logWarning

logWarning(): void

Logs a warning to YouTube.

Note: This API is best-effort and rate-limited which can result in data loss.

Example

function onWarning() {
  ytgame.health.logWarning();
}

ytgame.system

The functions and properties related to the YouTube system.
Functions
getLanguage	
Returns the language that is set in the user's YouTube settings in the form of a BCP-47 language tag.
isAudioEnabled	
Returns whether the game audio is enabled in the YouTube settings.
onAudioEnabledChange	
Sets a callback to be triggered when the audio settings change event is fired from YouTube.
onPause	
Sets a callback to be triggered when a pause game event is fired from YouTube.
onResume	
Sets a callback to be triggered when a resume game event is fired from YouTube.
Functions
getLanguage

getLanguage(): Promise<string>

Returns the language that is set in the user's YouTube settings in the form of a BCP-47 language tag.

Do not use other functions to determine the user's language or locale, or store their language preference in the cloud save. Instead, use this function to ensure that the user experience is consistent across YouTube.

Example

const localeTag \= await ytgame.system.getLanguage();
// \`localeTag\` is now set to something like "en-US" or "es-419".

Returns
Promise<string>	a Promise that completes when getting the language succeeded and rejects with an ytgame.SdkError when failed.
isAudioEnabled

isAudioEnabled(): boolean

Returns whether the game audio is enabled in the YouTube settings.

The game SHOULD use this to initialize the game audio state.

Example

function initGameSound() {
  if (ytgame.system.isAudioEnabled()) {
    // Enable game audio.
  } else {
    // Disable game audio.
  }
}

Returns
boolean	a boolean indicating whether the audio is enabled.
onAudioEnabledChange

onAudioEnabledChange(callback: ((isAudioEnabled: boolean) => void)): (() => void)

Sets a callback to be triggered when the audio settings change event is fired from YouTube.

The game MUST use this API to update the game audio state.

Example

ytgame.system.onAudioEnabledChange((isAudioEnabled) => {
  if (isAudioEnabled) {
    // Enable game audio.
  } else {
    // Disable game audio.
  }
});

Parameters
callback: ((isAudioEnabled: boolean) => void)	the callback function to be triggered.
Returns
(() => void)	a function to unset the callback that is usually unused.
onPause

onPause(callback: (() => void)): (() => void)

Sets a callback to be triggered when a pause game event is fired from YouTube. The game has a short window to save any state before it is evicted.

onPause is called for all types of pauses, including when the user exits the game. There is no guarantee that the game will resume.

Example

ytgame.system.onPause(() => {
  pauseGame();
});

function pauseGame() {
  // Logic to pause game state.
}

Parameters
callback: (() => void)	the callback function to be triggered.
Returns
(() => void)	a function to unset the callback that is usually unused.
onResume

onResume(callback: (() => void)): (() => void)

Sets a callback to be triggered when a resume game event is fired from YouTube.

After being paused, the game is not guaranteed to resume.

Example

ytgame.system.onResume(() => {
  resumeGame();
});

function resumeGame() {
  // Logic to resume game state.
}

Parameters
callback: (() => void)	the callback function to be triggered.
Returns
(() => void)	a function to unset the callback that is usually unused.


Page Summary

    All Playables on YouTube undergo a review process before public launch to ensure safety and smooth user experiences.

    Playables must meet various requirements relating to APIs, content, privacy, and trust & safety, with definitive guidance provided in the English versions of those requirements.

    Developers can utilize the provided McPlay to validate their Playables' integration with the Playables SDK.

    Playable release procedures involve communication with a designated Partner Manager.

    The requirements documentation uses RFC 2119 keywords to indicate the strictness of each requirement, ranging from absolute necessities (MUST) to optional implementations (MAY).

To verify smooth and safe experiences for players on YouTube, all Playables must go through a review process before being publicly launched. This includes required APIs, relevant restrictions, Trust and Safety, Privacy, and other content requirements.
Requirements

The review process is intended to confirm the Playables meet various requirements. Check the navigation to review the different types of requirements.
Test

Use the McPlay to validate your integration with the Playables SDK.
Release

Speak to your Partner Manager for details on this process.
Definitions

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", "MAY" and "EXPECT" used throughout these documents are to be interpreted as described in RFC 2119. An abridged list is included here for reference:

    MUST: This word, or the terms "REQUIRED" or "SHALL", means that the definition is an absolute requirement of the specification. If a Playable cannot meet any of such requirements, it will not be allowed to publish on YouTube.
    MUST NOT: This phrase, or the phrase "SHALL NOT", means that the definition is an absolute prohibition of the specification.
    SHOULD: This word, or the adjective "RECOMMENDED", means that there may exist valid reasons in particular circumstances to ignore a particular item, but the full implications must be understood and carefully weighed before choosing a different course. Completing those requirements would help Playables get better visibility.
    SHOULD NOT: This phrase, or the phrase "NOT RECOMMENDED" mean that there may exist valid reasons in particular circumstances when the particular behavior is acceptable or even useful, but the full implications should be understood and the case carefully weighed before implementing any behavior described with this label.
    MAY: This word, or the adjective "OPTIONAL", means that an item may or may not be implemented at the discretion of the implementer.
    EXPECT: This word is used exclusively to indicate requirements that YouTube EXPECTS to make required (aka MUST) in the subsequent version of these requirements, but which is optional for this document (MAY).


Page Summary

    This document outlines the required integration guidelines for games using the YouTube Playables SDK, including loading the SDK, managing game readiness, and handling user interactions.

    Games must use specific Playables SDK functions, such as firstFrameReady and gameReady, to manage the loading process and indicate when the game is ready for player input.

    The document details requirements for sending user scores, which involves using the sendScore function and ensuring accuracy in score tracking and saving.

    Games must implement cloud saving using the saveData and loadData functions, ensuring data integrity and backward compatibility across different game versions.

    Audio management is crucial, with games needing to respect system, device, and YouTube audio settings, and only using the isAudioEnabled and onAudioEnabledChange functions.

    Games must pause and resume in accordance to onPause and onResume callbacks provided by the SDK.

This section covers the integration between the Playable and the YouTube Playables SDK.
1 Load Playables SDK

    Game MUST load the YouTube Playables SDK before any of the game code.

2 Game ready notification

    Game MUST call firstFrameReady either when the game is rendering a loading screen or splash screen that explicitly communicates to the user that the loading process is underway.
    Game MUST call gameReady and MUST only call gameReady when the game is ready for user interaction (example: main menu or game is ready to play).
    Game MUST NOT call gameReady while there are still non-interactable elements being displayed to the user (example: splash screens or loading screens).

YouTube does not remove the "loading spinner" until this API is called.
3 User scores

    Game MAY use sendScore to send the user's score.
    If the game uses sendScore to send scores, the game MUST adhere to the sendScore specification and MUST ensure that the best score sent matches the best score in the game save.

4 Cloud saves

    Game MUST call saveData to save progress when users have made material game progress (for example, a level change) where the game mechanics lead the user to believe that their progress is saved.
    Game MUST NOT use any other mechanism to save user progress. This feature enables players to resume the game at a later point.
    Game MUST await loadData before calling saveData. If saveData is called before loadData completes successfully, the request will be rejected. This prevents the game from overwriting any previously saved data.
    Game MUST be able to use cloud save data from previous versions of the game without errors or crashes.
    Game SHOULD use the cloud save data to maintain user progress across all game versions where the user would expect their data to be used.
    Games SHOULD automatically save user progress at important game milestones to prevent data loss. A final flush save is performed when a user exits the game but is best effort and can only save up to 64 KiB in content length.

5 Mute toggle

    Game MUST respect system audio setting and mute button.
    Game MUST respect the YouTube audio setting and mute button by using isAudioEnabled and onAudioEnabledChange.
    Game MUST respect the volume control on the device.
    Game sound MUST NOT play unexpectedly.
    When YouTube mute is set, audio MUST NOT be output and game audio controls MUST NOT affect audio output.
    When YouTube mute is not set, game audio controls MAY affect audio output.
    Game SHOULD NOT show an overall mute button within the game itself; allow users to rely on the YouTube-level features for this.
    Game MAY have separate granular audio controls in the game, such as for music and sound effects, but they MUST follow all other audio control requirements.

see screenshot "audio_settings.png"
6 Pause and resume

The Playables SDK provides callbacks for cross-platform pause and resume capabilities.

    Game MUST pause all execution after onPause is called and MUST resume execution only when onResume is called. Execution includes all Playable capabilities, such as game loop, music, interactions, network calls, and rendering.
    Game MUST NOT use the web Page Visibility API or similar web APIs and MUST only use Playables SDK onPause and onResume.
    Game SHOULD save user progress when onPause occurs.



Page Summary

    Playables must be responsive, support touch and mouse input, and maintain game state during window resizing.

    Developers must provide specific metadata, including thumbnails, descriptions, and titles with character limits, and adhere to file naming conventions.

    Playables must clearly indicate content completion, avoid in-game sharing, external links, additional user agreements, and UI elements that mimic or conflict with platform controls.

    Games should support keyboard input, allow modal closure with the 'Esc' key, and provide a toggle for haptic feedback if included.

    Visual elements like text and graphics must render clearly across all resolutions and aspect ratios, while thumbnails and preview videos should adhere to recommended dimensions and formats.

This section covers interactions between Playables and the YouTube user experience.
1 Aspect ratio and orientation

    Game MUST follow responsive design: be playable in all aspect ratios and adjust automatically when the viewport changes. Non-exhaustive examples: 9:32, 9:21, 9:16, 3:4, 1:1, 4:3, 16:9, 21:9, 32:9.
    Game SHOULD fill the available viewport. If the game does not fill the available viewport, the game MUST be centered and include a pillarbox (left and right empty padding) or letterbox (top and bottom empty padding).
    Game MUST NOT lock device orientation or device posture.
    Game MUST maintain the game state or progress when the window is resized. We recommend not restarting or refreshing the game unless the user can quickly resume from the prior state.

Visual examples of these requirements:

see screenshot "aspect_ratio_and_orientation_examples.jpeg"

2 Interaction methods

    Unity: Packages for the experimental Unity wrapper (including the .jslib plugin) are available in our Playables sample repo.

    Game MUST support touch input for all interactions.
    Game MUST support mouse input for all interactions.
    Game MUST NOT unintentionally delay or ignore any user input.
    Game MUST NOT have any errors or unexpected behavior for any UI components.
    Game SHOULD support keyboard input for directional or text input.
    Game SHOULD allow users to close modals or dialogs using the Esc key.
    Game MUST NOT call preventDefault() on Esc events.
    Game MAY use haptic feedback where appropriate. If the game includes haptic feedback, game MUST provide a way to toggle haptic feedback on and off.

3 Game user interface (UI)

This section covers game user interface (UI) requirements.
3.1 Rendering

    Game MUST render all text and graphics clearly (not blurry, pixelated, or stretched) across all screen resolutions, aspect ratios, and densities.

4 Metadata

Developer MUST provide all required metadata fields when using the Developer Portal to publish games. Full details about metadata requirements can be found in the Developer Portal.

Developer MUST NOT include any branding or logos in the thumbnails, description, or title.

A non-exhaustive list of the types of metadata required are:

    Image thumbnails in several different aspect ratios
    Game description
    Game title
    Game genre
    Publisher / Developer information

5 Completion of content handling

    Game MUST communicate that there is no more content to engage with, such as after the final level or at the end of game progression.

6 Disallowed elements

This section covers elements that are disallowed in Playables.
6.1 In-game sharing

    Game MUST NOT display in-game sharing prompts.

6.2 External links

    Game MUST NOT display clickable links that take users directly to external content, such as other sites or games. Links are allowed in the game and channel description following the same YouTube policy for video content.

6.3 Additional user agreements

    Game MUST NOT display an additional user agreement. Users agree to relevant YouTube policies, terms, and privacy details.

6.4 Elements that create confusion

    Game MUST NOT place icons that are identical to Playables actions in close proximity to the actual Playables actions, such as the close, mute, or menu buttons.
    Game MUST NOT have an in-game exit or quit button.


see screenshot "identicalbuttons"


This section covers internationalization (i18n) and localization (L10n) requirements.
1 Language APIs

    Game MAY use getLanguage to retrieve the user's current locale setting and adjust the game accordingly.
    Game MUST NOT use web localization APIs, such as navigator.languages or navigator.language.

2 Language support

    Game MUST support the English language.


Page Summary

    Monetization is not supported within YouTube Playables.

    In-game advertising is strictly prohibited within YouTube Playables.

    In-game purchases are not allowed within YouTube Playables.

This section covers monetization within Playables.
1 In-game monetization

    Game MUST NOT implement monetization using off-platform services. Monetization using off-platform services is not supported for YouTube Playables at this time.

2 In-game advertising

    Game MAY display in-game advertising using YouTube-provided ads functions.
    If the game uses YouTube-provided ads functions, it MUST continue to correctly handle muting and unmuting using isAudioEnabled and onAudioEnabledChange and pause and resume using onPause and onResume.
    Game MUST NOT display in-game advertising of any kind using off-platform services. Advertising using off-platform services is not supported for YouTube Playables at this time.

3 In-app purchases

    Game MUST NOT offer in-app purchases of any kind using off-platform services. In-app purchases using off-platform services are not supported for YouTube Playables at this time.


Page Summary

    Games must adhere to the Google Privacy Policy.

    Games must not make external calls to any URLs or services, except when required for compliance with other Technical Requirements.

    Games must not attempt to bypass the restrictions placed on external calls.

    Games are restricted from accessing the user's clipboard unless the user performs a direct paste action.

This section covers privacy and data requirements.
1 Policies

    Game and developer MUST adhere to the Google Privacy Policy.

2 External access

These requirements pertain to the usage of third-party services.
3 External calls

    Game MUST NOT make external calls to any URLs or services, except where explicitly required to comply with other Technical Requirements (i.e., to call APIs owned by Google or YouTube).
    Game MUST NOT attempt to circumvent external call prevention.
    Game MUST NOT generate or display graphical content resembling or functioning as a Quick Response ("QR") code.

4 User data

These requirements pertain to the access and handling of user data.
4.1 Clipboard

    Game MUST NOT access the user's clipboard, unless it is in response to a player's explicit paste action.

4.2 Sensitive personal information

    Playables content MUST NOT prompt the user to enter, or in any way collect, personal information. This includes, but is not limited to, the names, ages, locations, usernames, or passwords of users.
    Playables content MUST NOT display any graphical content resembling or functioning as a login or account creation screen.

5 Obfuscation

Creators MUST NOT obfuscate code or conceal the functionality of the game. Minification is allowed, including the following forms:

    Removal of whitespace, newlines, code comments, and block delimiters
    Shortening of variable and function names
    Collapsing files together

Direct transpilation of TypeScript to JavaScript is not in itself a violation of this requirement, unless additional obfuscation techniques are applied.
6 Code size and complexity

Games will be restricted to a total size or complexity of code (including the content of Script tags, JavaScript, WebAssembly, etc) that YouTube's tooling can scan and analyze. The maximum allowed size may change over time.
7 Language features

In its sole discretion, YouTube may decline to approve games it cannot evaluate for compliance with Google policies and other legal requirements due to use of language features such as:

    WebAssembly (WASM)
    eval()
    Web workers

8 Single page applications

Playables MUST be implemented as Single Page Applications ("SPAs").

Page Summary

    Playables must have an initial bundle size under 15 MB and a total bundle size under 250 MB, ideally striving for 5 MB and 15 MB respectively.

    Individual files within the Playable should not exceed 30 MB, with a recommended size of less than 512 KB.

    Saved game data must be kept under 3 MB and should ideally be less than 500 KB to ensure efficient storage.

    Playables are expected to load and be interactive within 5 seconds to provide a seamless user experience.

    Games must be built using standard web technologies, be compatible with all YouTube-supported browsers, and not have reproducible crashes or exceed specified memory limits.

This section covers the stability and performance of Playables.
1 Initial bundle size

To properly test this requirement, the game may need to be ingested with the developer portal and then tested in the McPlay. Alternatively hosting with compression on or zipping all of the initial loaded content can provide a good approximation.

    Game initial bundle size MUST be less than 30 MiB.
    Game initial bundle size SHOULD be less than 15 MiB.

2 Total bundle size

    By default, the game total bundle size MUST be less than 250 MiB. Exceptions to this can be found in the FAQ.
    Game SHOULD only load the minimal amount of data needed to enable interactivity and lazy load the other data as needed.

3 Individual file size

    Every individual file within the game MUST be less than 30 MiB.
    Every individual file within the game SHOULD be less than 512 KiB.

4 Saved game size

    Saved game size MUST be less than 3 MiB.
    Saved game size SHOULD be less than 500 KiB.

5 Load time

    Game SHOULD finish loading and allow user interaction in under 5 seconds.

6 Crashes

    Game MUST NOT have consistently reproducible crashes.
        Game MUST NOT exceed a peak JavaScript heap size of 512 MB. See the memory usage restrictions faq for why this causes crashes on iPhones.
    Game MUST NOT crash the YouTube app, YouTube website, or other user software.

7 Technologies used

    Game MUST be based on standards-compliant Web APIs (e.g., JavaScript, Canvas, WebGL) as defined by standards bodies (e.g., W3C, WHATWG).
    Playables MUST be compatible with all browsers that YouTube supports (including Edge, Chrome, Firefox, etc.)
    Playables MUST be compatible with the YouTube app on Android and iOS.

8 File references

    Game MUST only use relative paths when referring to other files in the game bundle.
    Game MUST NOT use absolute paths, as they will fail to load.

9 File names

    Files in the game bundle MUST only contain alphanumeric and a few special characters: _, -, ..

10 File count

    The total number of files in the game bundle MUST be at most 8000. You can use the Playables bundle analyzer to conduct an initial validation of the game bundle. This validation will assess the size of each individual file, the overall bundle size, and any potential filename inconsistencies.



Page Summary

    Playables content must adhere to the YouTube Community Guidelines and not contain any inappropriate content.

    Playables content must not be specifically made for kids and must be suitable for a general audience aged 13 and older.

    Playables must comply with the YouTube Developer Terms of Service governing the use of YouTube's APIs.

    All Playables content must have fully cleared third-party intellectual property, trademark, music, and personality rights.

    The content must be reviewed in the English version of the requirement pages for definitive guidance.

This section covers Trust and Safety requirements.
1 Game content and audience

These requirements pertain to the safety and appropriateness of the content.
1.1 Community guidelines

    Playables content MUST follow the YouTube Community Guidelines, and must not contain inappropriate content listed in the guidelines.

1.2 Made for Kids

    Playables content MUST NOT specifically target kids, or be "made for kids" or "just for kids". Refer to Determine if your content is "made for kids".
    Playables content MUST be suitable for the general audience (Age 13+).

1.3 Misleading Metadata or Thumbnails

    Playables does not allow using the title, thumbnail, or description to trick the users into believing the Playables content is something it is not.

2 Rights and clearances

These requirements pertain to content ownership and rights.
2.1 YouTube Developer Terms of Service

    Playables MUST comply with the YouTube Developer Terms of Service which govern the use of YouTube's APIs.

2.2 Intellectual property

    Playables uploaded by content owners MUST have fully cleared third-party intellectual property rights.
    The content MUST be cleared for the intellectual property rights and MUST NOT violate any trademark, copyright, or music rights.

2.3 Third-party trademarks

    Playables MUST NOT infringe on any third-party trademark or trade dress rights.

2.4 Music rights

    Playables MUST have all necessary music rights in place for distribution.

2.5 Personality rights

    Playables MUST have all necessary personality rights secured for distribution (name, likeness, etc.).

3 External sharing

    During Playables game certification, you will receive a development and staging release link to help test the game. This dev link and staging link MUST NOT be shared externally or outside of game certification testing purposes.


This section covers accessibility (a11y) requirements.
1 Third-party guidelines

This section covers applicable third-party guidelines for accessible experiences.
1.1 Web Content Accessibility Guidelines (WCAG) AA

    Developer SHOULD make a best effort to make Playables accessible for better user experience and discovery by following the Web Content Accessibility Guidelines (WCAG) AA.


Page Summary

    Ensure games adapt to various screen sizes and orientations, using pillarboxing or letterboxing if full responsiveness isn't possible, and avoid triggering scrollbars within the canvas.

    Maintain clear rendering across different screen resolutions by avoiding blurry or pixelated assets, and ensure that game UI elements like text and icons scale appropriately on both low and high-resolution screens.

    Use font sizes, weights, and color contrast ratios that ensure legibility across different devices, following guidelines of a minimum of 4.5:1 contrast ratio for text under 18pt, and 3:1 for all other text.

    Design touch targets to be at least 48x48 dp with 8 dp spacing, use unique styles for each button state (enabled, disabled, hover, focused, pressed), and support keyboard input for all gameplay controls and navigation.

    Include a minimal tutorial or onboarding level for new players to learn gameplay basics, clearly communicate the game's pause state with a "paused" label and resume option, and provide an end-of-game message for games with finite levels.

The following design best practices help ensure an optimal experience for users playing your game on YouTube across different devices and platforms.

Aside from the operating system components, the Playables experience primarily consists of three components:

    Playables actions
    Game canvas
    Menus and dialogs


see screenshot "playables_view.png"


These game design best practices provide recommendations for how to build your game for the game canvas.
Game resizing

Ensure that games adapt appropriately to different screen sizes and orientations by considering these practices.

Resize the game and adapt the UI to the size and aspect ratio of the canvas.

see screenshot "size_2"

Use pillarboxing or letterboxing if the game can't be fully responsive to the game canvas size and aspect ratio.

see screenshot "scroll.png"

Avoid triggering scrollbars. Scrollbars negatively affect both gameplay and general navigation. Fill the canvas without resulting in the game becoming scrollable within the canvas. Scrollbars are OK for intentional scrolling, for example when scrolling through a long vertical list within the game UI. Ideally, games are fully responsive to the viewport.
Game scaling

Render clearly (not blurry, pixelated, or stretched) across different screen resolutions.

Ensure that the game UI (texts, icons) scales appropriately when rendered on both lower resolution screens (such as 360x800 mobile devices) and higher resolution screens (such as 3840x2560 desktop monitors).


see screenshot "gameUI.png"

Avoid low-resolution rasterized assets that appear blurry when scaled to large screens.
Typography

Ensure legibility across devices and screen sizes.

The texts appearing within the game such as buttons, menus, and speech bubbles need to be legible across different devices and screen sizes. This can be achieved by scaling and adapting the text automatically or by offering users a setting to adjust font size.

If the text is smaller than 18pt, or if the text is bold and smaller than 14pt, set the color contrast ratio to at least 4.5:1.

For all other text, set the color contrast ratio to at least 3:1.

For general reference, see WCAG2.1.

see screenshot "star1.png"  and "star2.png"

Use large font sizes with enough weight and contrast for legibility. In this example, the contrast ratio is 4.48:1.	Avoid small font sizes and low contrast colors. In this example, the contrast ratio is 3.07:1.
Interaction

This section covers best practices around user interactions and related elements.
Touch targets

Make touch targets large enough for easier interaction.

Ensure that touch targets are at least 48x48 dp with at least 8 dp of space between targets (see Material Design Guidelines) for easier interaction.

In this example, the visually rendered button is 24 dp, while the invisible touch target includes 12 dp around the icon to achieve the 48x48 dp touch target.


see screenshot "touchtarget.png"

Add padding around icons and buttons to increase touch target size.
Buttons

Use unique styles for each button state:

    Enabled
    Disabled
    Hover (for non-touch input devices)
    Focused
    Pressed

Aim to differentiate buttons by hierarchy as well. For example, primary versus secondary action buttons in a Start menu (see Google Material 2 Design Guidelines for buttons).

see screenshot "buttons.png"
Unique styles that distinguish each button state
Keyboard input

To increase the accessibility of the game across devices and users, support keyboard input for all gameplay controls and screen navigation in addition to touch and mouse input.

For games that support keyboard input, allow users to close any in-game menus and dialogs using the Esc key. This is in addition to having a visual close button (for example, an X icon at the top corner). Common examples of modals or dialogs are Settings menu, Pause menu, error messages, and Help info pop-ups.

Avoid mapping any actions to the long-press of the Esc key, as this is used for exiting fullscreen mode on desktop web browsers.

For games that have keypress listeners registered: don't use preventDefault() with Esc key events. When in fullscreen in Safari, this causes the key press event to be consumed by the game without exiting fullscreen.
Haptics

When appropriate, it is recommended to use haptic feedback (vibrations) to make your games feel more fun and immersive.
Key game moments

This section covers key moments in a game that create a great experience for the player.
Tutorial

Include a brief tutorial or onboarding level to help new players.

Onboarding ensures that users learn the basic gameplay and game essentials to proceed with and enjoy the game.

Since Playables are intended to be quick and approachable for users to start playing, aim to keep the onboarding as minimal as possible. While not all games require a tutorial, most games benefit from some form of onboarding. Consider the key mechanics, rules, and skills that the player needs to know to successfully play and enjoy the game.

Tutorials can be in the following format:

    Set of screens at the beginning of the game (or more ideally, presented contextually throughout the game when appropriate)
    Actual tutorial level that the user plays through

Pause

Clearly communicate the game state to the user.

Clearly communicate to the user when the game is paused and how the user can resume the game. Avoid causing the user to think that the game has frozen or crashed.

see screenshot "pausemenu.png"
Clearly label the game state as "paused" and provide a clear action (button) to resume the game.
Game end

Communicate to the user that they have completed the last level or they have finished the game.

If the game has a definitive end (for example, a finite number of levels), clearly communicate that fact to the user. This avoids causing the user to think that the game is broken or frozen. Ideally, the game celebrates and congratulates the player for completing the game.
Audio

The game can contain separate volume controls for effects, speech, and background music. Controls can consist of sliders to adjust volume or a mute toggle for each or both.

see screenshot"audio_settings"

Accessibility

Accessibility in design allows users of diverse abilities to play and enjoy your game.

Unlike web and software design, industry standard accessibility guidelines for game design don't exist. For a good resource with additional guidelines on inclusive game design, see Game accessibility guidelines. We recommend that you consider how these guidelines can be applied to your game's design.


Page Summary

    This page provides a detailed revision history for the Playables Technical Requirements, Playables SDK, and Playables Game Design Guidelines documents.

    Recent updates include refactoring technical requirements, increasing the bundle size limit, adding lazy loading guidance, and improving the McPlay for development.

    Key changes have been made to file size and bundle limits, as well as the addition of new requirements like the IN_PLAYABLES_ENV boolean for detecting the Playables environment and the requirement for relative file paths.

    The Playables McPlay has been significantly enhanced, now being hosted online and including features like checking for unsupported file name characters and mocking the loading screen.

    The Playables Game Design Guidelines documentation was added and has received updates to standardize verbiage, update best practices, and address various design elements like thumbnails, device adaptation, and user interface requirements.

This page provides a revision history for the following documents:

    Technical Requirements
    Playables SDK
    Playables Game Design Guidelines

July 11, 2024

    Refactored the technical requirements into multiple pages.
    Requirements cleanup and deduplication.

June 24, 2024

Increased total bundle size limit from 100 MiB to 250 MiB and added lazy loading guidance.
June 17, 2024

McPlay Updates:

    Games no longer need to be served over HTTPS and can be served from localhost for testing.
    Refresh button added next to URL field to refresh content of iframe without reloading the entire McPlay.

May 16, 2024

Move the design best practices to a separate document to better delineate between design requirements and best practices.
May 08, 2024

Refactored the Playables developer site to broaden access and improve navigation.
May 07, 2024

Updated the Technical Requirements for Game Ready Notification with additional details for the firstFrameReady call.
May 3, 2024

    Created an archive of previous requirements versions.

March 05, 2024

Increased individual file size limit from 10 MiB to 30 MiB.
February 23, 2024

Added IN_PLAYABLES_ENV boolean to top level namespace to tell developers when their game is running within the Playables environment.
December 04, 2023

McPlay updates

    Added check for unsupported characters in file names.
        For information on supported characters, check Technical Requirements - 1.9 File names.
        Known limitation: This check may not validate all loaded resources.
    Added feature to mock the loading screen, including setting the initial iframe height be set to 0.
    Updated the pause-resume button to more closely match production by toggling audio when pausing and resuming.
    Removed non-actionable messages from event logging.

November 10, 2023

The downloadable McPlay bundle has been replaced with the hosted McPlay.

The TypeScript type definitions file, previously available in the McPlay bundle, has been moved to the main Playables SDK article.
September 07, 2023

The Get started section has been updated to change the Playables SDK URL from v0 to v1.
August 30, 2023

The File names and Thumbnails sections have been updated to remove references to explicitly list the allowed special characters (_, -, .).

Additionally, Cloud saves section has been updated to require cloud saves to work in new game versions.
August 25, 2023

The saveData section has been updated to clarify that a save data must be a valid and well-formed UTF-16 string.
August 18, 2023

The Pause and resume section has been updated to clarify that the game must pause all executions after onPause is called and only resume once onResume is called.
August 11, 2023

The File names section has been added to include character limitations used to name files in the game bundle.
August 10, 2023

The Interaction methods section has been updated to require all of the UI components of a game to work as intended and without errors or unexpected behaviors.
August 09, 2023

The Thumbnail images section has been added to list the game's thumbnail requirements allowing users to effortlessly discover and recognize a Playable in YouTube.
August 08, 2023

The Gestures and input section has been updated to prohibit the game to call preventDefault() on Esc events.

Additionally, a new File references section has been added to require games to only use relative paths when referring to other files in the bundle as using absolute paths can cause error.
August 02, 2023

The Mute section of both the Technical Requirements and Playables Game Design Guidelines have been updated to refer to the mute and unmute features as audio controls and to indicate that the granular audio controls may contain either volume sliders or a mute toggle or both.
July 28, 2023

The Playables Game Design Guidelines documentation has been updated to standardize verbiage and update best practices and screenshots.
July 20, 2023

The Pause and resume section has been added to provide cross-platform pause and resume capabilities.
July 19, 2023

The YouTube Playables site now includes the Playables Game Design Guidelines documentation to serve as a guide in providing an optimal game experience for users playing YouTube games across different devices and platforms.

The game design guidelines focuses on the following areas:

    Thumbnail images
    Device adaptation
    User Interface (UI)
    Gestures and input
    Pause
    Mute
    Haptic feedback
    User onboarding
    Game end (win screen)
    Accessibility

Additionally, the onAudioEnabledChange section has been updated to fix a small typographical error on the code which caused an error in Flutter's proposed JavaScript interoperability (JS-Interop) layer.
July 14, 2023

The Size section has been updated as follows:

    Removed the requirement that the game must be playable in full-screen on a desktop and in landscape or portrait on mobile.
    Added that the game must be playable in portrait.
    Added that the game should be playable in landscape. Otherwise, the game must be centered or must include a pillarbox.
    Added that the game must not lock device orientation.

July 11, 2023

The Flutter web (experimental) section has been added to enable integration with games written with Flutter Web.
July 01, 2023

The Mute toggle section requires the game to respect the audio setting of both YouTube and the system and that the game sound must not play unexpectedly.

Additionally, Completion of Content Handling section clarifies that the game must communicate to the user that there is no more content to interact with such as in the final level or game completion.
June 30, 2023

The Get started section now includes a note that the SDK would be a no-op when the game is served locally. To verify SDK integration correctness, see McPlay.
June 02, 2023

The YouTube Playables site now includes the Playables SDK documentation that features a robust set of APIs to support YouTube games.
May 26, 2023

The Technical Requirements documentation updates are as follows:
Section 	Changes
Load time 	Included the average internet speed of 6.8Mbps worldwide and 20Mbps for US.
Interaction methods 	Added that when a user interacts with the game, the game must not unintentionally delay or ignore input.
Thumbnails 	Updated the required image resolutions for the 1:1, 5:7, and 16:9 ratios.
Publisher or Developer information 	Added this new section requiring the game to include the name of the publisher or developer and may also be required to provide content rating in the future.
Load Playables SDK 	Added this new section requiring the game to load the Playables SDK before any of the other game code.
Game Ready Notification 	Updated to call the firstFrameReady API only when the first frame of your game is ready to be rendered on the screen and to only call the gameReady API when the game is ready for any user interaction.
Mute toggle 	Added that when the YouTube mute is set, the audio must not be output and the game's mute or unmute controls must not affect the audio output.
March 24, 2023

The YouTube Playables site now includes the Technical Requirements documentation with the aim to provide a smooth gaming experience to users playing games on YouTube.

The technical requirements section focuses on the following areas:

    Game stability
    YouTube experience
    YouTube integration
    Localization
    Monetization


Page Summary

    This wrapper allows access to the YouTube Playables SDK within Unity C# projects, streamlining development with a .jslib plugin and a C# file.

    Two Unity packages are provided: one with just the core wrapper components, and another that includes a sample project demonstrating how to integrate the SDK.

    To use this, your Unity project platform must be set to WebGL, and the web SDK should be initialized in your index.html file as instructed in the documentation.

    The YTGameWrapper.cs script, included in both packages, serves as the primary interface for interacting with the YouTube Playables SDK within your Unity project.

    Lazy loading through Unity's Addressables or Asset Bundles is recommended to manage file sizes and load content dynamically, potentially allowing for larger project sizes.

With this wrapper you can access the YouTube Playables SDK in Unity C#. The wrapper has a .jslib plug-in and a C# file to help speed up your development. There is also a sample project that shows how you can use these in your project.

Unity Packages can be downloaded from our Playables sample repo.
Usage

    Verify your Unity project Platform is set to WebGL. This setting can is found in Build Settings.

    Either use the WebGLTemplate to build your game for web, or follow the Use your own index.html file section and verify you have setup and initialize the web SDK in your index.html file.
        WebGLTemplate can be found in the package Google-WebGLTemplate-only.unitypackage or GoogleYTGameWrapper-with-sample.unitypackage. To set and use this template up follow the steps in the WebGL Template section.
        To use your own Web and index.html file, you will need to add two lines to your index.html Unity creation script, see Use your own index.html file section for integration.

    Open your project in Unity, then open and import either package into your project.
        GoogleYTGameWrapper.unitypackage: Contains JS Plugin for connecting the YouTube Playables SDK and a C# wrapper to help connect this to your product.
        GoogleYTGameWrapper-with-sample.unitypackage: Contains the same files content as those found in GoogleYTGameWrapper package and a sample showing how to use YouTube Playables SDK in C#.

    IMPORTANT: In your main scene create a new gameobject and name it YTGameWrapper. This game object is used to communicate with the JS bridge.

    IMPORTANT: Add the imported YTGameWrapper.cs code as a script component to the YTGameWrapper GameObject.

    If your project has multiple scenes make sure to add DontDestroyOnLoad to the YTGameWrapper.cs script (note: new versions of the script have a DontDestroyOnSceneChange toggle which is on by default). This will make sure the script and GameObject sticks around throughout your game.

    GameObject.DontDestroyOnLoad(this.gameObject);

    The YTGameWrapper.cs component and YTGameWrapper GameObject are used to connect to the YouTube Playables SDK. Use these to connect to YouTube. Either using Script to find the object and component or manually add these to your game code through the Unity Editor.

    Verify you are following technical requirements for your project.

Use your own index.html file

If you don't use the index.html example provided you will need to add two lines of code to your index.html Unity creation script.

First, add this line in the same place your project sets up variables for the Unity container, canvas, etc.

```
var container = document.querySelector("#unity-container");
var canvas = document.querySelector("#unity-canvas");

var unityGameInstance = null; // <-- Add this line >

...


Second, inside the `createUnityInstance` function add this line.

    ```
    createUnityInstance(canvas, config, (progress) => {
        progressBarFull.style.width = 100 * progress + "%";
    }).then((unityInstance) => {

        unityGameInstance = unityInstance; // <-- Add this line >

    ...

Examples

This section has some examples of how to use the C# wrapper, it is not the full list of available APIs. For the full list of available APIs, refer to the YouTube Playables SDK.
sendScore

This example shows an implementation of sendScore(int points) in C#:

...
using YTGameSDK;
...

public YTGameWrapper ytGameWrapper;
public int battleScore = 0;

...

// Update the total score and send this to the YouTube Game Wrapper.
public void UpdateScores(int scoreAmt)
{
    battleScore += scoreAmt;
    // ytGameWrapper should be a reference to your YTGameWrapper component.
    ytGameWrapper.SendGameScore(battleScore);
}

onPause

This is an example of how a game can listen to Pause events coming from YT Playables, to pause its engine when needed:

...
using YTGameSDK;
...

public YTGameWrapper ytGameWrapper;
public bool gameIsPaused = false;

...
void Start()
{
    // Sets the OnPause callback with the YT Playables SDK
    ytGameWrapper.SetOnPauseCallback(PauseTheGameCallback);
}

// Pause game callback, will pause the game when called.
public void PauseTheGameCallback()
{
    gameIsPaused = true;
}

saveData

This is an example of how to use saveData, sending it to YT Playables SDK:

...
using YTGameSDK;
...

public YTGameWrapper ytGameWrapper;

...

// Saves the current score of the game and converts it to a JSON format.
public void SaveScore(int scoreAmt)
{
    SaveGameData("{\"BestScore\": \"" + scoreAmt.ToString() + "\"}");
}

public void SaveGameData(string saveString)
{
    if (string.IsNullOrEmpty(saveString)) return;

    // Sends save data to the YT Playables SDK
    ytGameWrapper.SendGameSaveData(saveString);
}

loadData

This is an example of how to use loadData, sending it to YT Playables SDK:

...
using UnityEngine;
using YTGameSDK;
...

[Serializable]
public class LoadedScores
{
    public int BestScore;
    public float BestTime;
}

public YTGameWrapper ytGameWrapper;

...

void Start()
{
    ytGameWrapper.LoadGameSaveData(LoadSaveGameDataReturned);
}

public void LoadSaveGameDataReturned(string data)
{
    if (!string.IsNullOrEmpty(data))
    {
        LoadedScores loadedScores = JsonUtility.FromJson<LoadedScores>(data);
        Debug.Log("LoadSaveGameDataReturned > Score <" + loadedScores.BestScore.ToString()
                  +   "> Time <" + loadedScores.BestTime.ToString("0.00"));
    }
}

requestInterstitialAd

This is an example of how to use requestInterstitialAd, indicating it is a good time to show an interstitial Ad, if available. For the best results, make this call during a break in gameplay, for example, at the end of a level.

...
using YTGameSDK;
...

public YTGameWrapper ytGameWrapper;

...

// At the end of a round send a request to show an interstitial Ad, if one is
//  available an Ad will be shown and Pause Game Callback should be called.

// EXAMPLE: send and forget
public void RequestInterstitialAd()
{
    ytGameWrapper.RequestInterstitialAd();
}

// EXAMPLE: send and react to if an Ad was shown
public void RequestInterstitialAd()
{
    int status = ytGameWrapper.RequestInterstitialAd();
    if (status == 0)
    {
        // Ad request was successful, do some action.
    }
}

If the requestRewardedAdmethod is not present in your version of theYTGameWrapper.cs` script, you must implement it yourself to access this functionality. The provided Unity Wrapper is an experimental sample and does not contain the full list of available SDK APIs.

To implement this, you will need to:

    Update the .jslib plugin: Add a JavaScript bridge function that calls ytgame.ads.requestRewardedAd(rewardId).
    Update YTGameWrapper.cs: Add a C# method that uses [DllImport("__Internal")] to call the new .jslib function.

requestRewardedAd`

This is an example of how to use requestRewardedAd. This is used when a user has selected to view a rewarded Ad in exchange for some reward in your game. If an Ad is available one will be presented to the user.

...
using YTGameSDK;
...

public YTGameWrapper ytGameWrapper;

...

public void RequestRewardedAd()
{
    // Register callback for Rewarded Ads. If an Ad is available one will be
    //  shown. Pause Game Callback should be called. Any ID is fine as long as
    //  its identifyable for your game.
    ytGameWrapper.RequestRewardedAd("my-reward-ad-id-123", (rewardEarned) => {
        if (rewardEarned) {
            // Rewarded Ad is earned, reward the user.
        } else {
            // Rewarded Ad not earned, take the appropriate action
        }
    });
}

How to use YouTube's example WebGL Template

Unless you have a very heavy Unity project your built .wasm and .data files should be under our individual file size limit. If this is the case no extra compression should be done on your end for these files as they will be automatically compressed on submission of your Playable files. This automatic compression will also verify that your .wasm file fits into the initial bundle size requirement. As an example, a ~25 MiB .wasm file will compress to ~7 MiB.

If for some reason your files are over the maximum individual file size limit, it is best to use ZIP compression to verify they fit into this limit. Playable compression won't re-compress these files.
WebGL Template

    Follow the Unity package instructions above for initial setup. Make sure to use Google-WebGLTemplate-only.unitypackage or GoogleYTGameWrapper-with-sample.unitypackage and import all files under WebGLTemplates/YTGameWrapperTemplate/ folder.
        Note: if you have not already imported YTGameWrapper.cs and UnityYTGameSDKLib.jslib you should import those as well.
    Set your WebGL Template to use YTGameWrapperTemplate. This setting is in Edit -> Project settings -> Player -> WebGL tab -> Resolution and Presentation section.
        Note: Default Canvas Width and Height are set to 100% in the template so these Unity settings won't adjust anything.
    Make sure your Compression Format is set to Disabled. This setting is in Project settings -> Player -> WebGL tab -> Publishing Settings section.
    Build for WebGL in the Build Settings window then go to step 7 or 5 based on your projects needs.
    Only follow steps 5 & 6 if compression is used: After your project is built navigate to your build folder location and open the Build folder. Find your projects .wasm or .data files that need compression to fit into the individual file size limits and zip these files. Make sure to delete the original .wasm/.data files that were compressed as you will be submitting the *.wasm.zip and *.data.zip files instead.
        Note: if you are using a Mac you can right-click the file and select "Compress *". On PC you can right-click the file and select "Compress to ZIP file".
    Only follow if you did step 5: Update the index.html file built from YTGameWrapperTemplate to load zipped files and decompress them.
        Near the end of the index.html files you will find Path 1 and comment out the following line InitUnitySection();.
        Near the end of the index.html files you will find Path 2 and comment out the following line loadResources(InitUnitySection);.
    When submitting your project for Certification you will need to send all files built from Unity to your build location from Step 4. If steps 5 + 6 were followed, include these files as well.

Upgrade the provided samples to use Universal Render Pipeline (URP)

One of the latest advancements with newer versions of Unity is that they use Universal Render Pipeline (URP). To upgrade the sample so everything renders correctly.

    Start by importing the GoogleYTGameWrapper-with-sample.unitypackage package into a new or existing project.
    Navigate to the Render Pipeline Converter window: Window -> Rendering -> Render Pipeline Converter.
    Select Rendering Settings, Material Upgrade, and Readonly Material Converter.
    Next select Initialize and Convert, wait for this to finish and the sample should be ready for URP.

How to break up assets in your Unity project (Lazy Loading)

One of the main problems developers have highlighted when using Unity is staying under the individual file size requirements and the total bundle size requirements.

Lazy loading of assets is a great optimization you can make for your project as you can load assets, levels, and data as they are needed. Our certification team may waive the overall file size restrictions if this is properly done, as your full game won't be loaded up front, but as a user navigates your product.

To help with proper loading, Unity has a number of ways to split up your assets verifying that your individual asset groups are under the size limits and that you load content over time. We suggest using either Addressables or Asset Bundles.
Addressables

Addressables allow you to identify different files that should be loaded together and Unity will handle most of the packaging for you. Unity also provides some tools to manage file sizes and help make sure you are not duplicating assets.

To use Addressables you will need to import the Addressables package through the Package Manager in Unity then tag your assets into Addressable Groups. More details can be found through Unity documentation.
Asset Bundles

Asset Bundles are helpful as you can split up your project and load elements on the fly. These are helpful for DLC, levels packs, new characters, and more. Asset Bundles are great for self managed content loading and bundling. These can be used by tagging your assets into specific bundles, then loading bundles as you need them. More details can be found in Unity's Asset Bundle documentation.

See the full YT Playables API reference.

// The Cloud Functions for Firebase SDK.
const functions = require("firebase-functions");

// The Firebase Admin SDK to access Firestore.
const admin = require("firebase-admin");

// Load googleApis SDK
const {google} = require("googleapis");

// Configuration constant
const MAX_RESULTS_VIDEOS_COUNT = 50;
const DOCUMENT_CHUNK = 13;
// Monterrey, Buenos Aires, Sao Pablo
const channelIds = ["UCuEQdJ0OFVgCOp8k50fVoZQ", "UCBlhI4thciKCIW2kkH6AggQ",
  "UCXxrdKA3RJx2sFKB-6M0wgw"];

// Initialize admin firebase
admin.initializeApp();

// Schedule updates for the lastest videos for every channel
exports.scheduledFunction = functions.pubsub.schedule("every 12 hours")
    .onRun((context) => {
      channelIds.forEach((channelId) => {
        getChannelLastestVideo(channelId, MAX_RESULTS_VIDEOS_COUNT);
      });
      return null;
    });

// Read every global enviroment configurations
exports.updateEnviromentConfigs = functions.firestore
    .document("/environment/global")
    .onUpdate((change, context) => {
      // Grab the current value of what was written to Firestore.
      const forceRefresh = change.after.data().forceRefresh;

      if (forceRefresh) {
        channelIds.forEach((channelId) => {
          getChannelLastestVideo(channelId, MAX_RESULTS_VIDEOS_COUNT);
        });
        return change.after.ref.set({forceRefresh: false}, {merge: true});
      } else return null;
    });

/**
 * Get the lastest videos from youtube API V3.
 * @param {string} channelId channel id.
 * @param {number} maxResults Max amount of videos fetched.
 */
function getChannelLastestVideo(channelId, maxResults) {
  const service = google.youtube("v3");
  service.search.list({
    auth: "your_api_key",
    part: "id,snippet",
    maxResults: `${maxResults}`,
    order: "date",
    channelId: channelId,
  }, function(err, response) {
    if (err) {
      return `The API returned an error: ${err}`;
    }

    const collection = admin.firestore().collection(channelId);

    const youtubeVideosArray = response.data.items.map((element) => {
      let thumbnail;
      if ("high" in element.snippet.thumbnails) {
        thumbnail = element.snippet.thumbnails.high;
      } else {
        thumbnail = element.snippet.thumbnails.default;
      }
      return {
        id: element.id.videoId,
        title: element.snippet.title,
        description: element.snippet.description,
        publishedAt: element.snippet.publishedAt,
        isLive: element.snippet.liveBroadcastContent == "live",
        isUpcoming: element.snippet.liveBroadcastContent == "upcoming",
        channelId: element.snippet.channelId,
        channelTitle: element.snippet.channelTitle,
        thumbnailUrl: thumbnail.url,
        thumbnailRatio: thumbnail.height / thumbnail.width,
      };
    });

    let documentId = 1;
    youtubeVideosArray.chunk(DOCUMENT_CHUNK).forEach((elements) => {
      collection.doc(`${documentId}`).set({
        id: documentId,
        videos: elements,
      });
      documentId = documentId + 1;
    });

    return JSON.stringify(response.data);
  });
}

// eslint-disable-next-line no-extend-native
Object.defineProperty(Array.prototype, "chunk", {
  value: function(chunkSize) {
    const R = [];
    for (let i = 0; i < this.length; i += chunkSize) {
      R.push(this.slice(i, i + chunkSize));
    }
    return R;
  },
});

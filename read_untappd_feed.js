const fetch = require('node-fetch');
const qs = require('querystring');
const checkStatus = require('fetch-check-http-status').default;
const API_ENDPOINT = 'https://api.untappd.com/v4';
module.exports = async (venueId, currentNewestId, credentials) => {
  let {checkins, hitMaxAgeLimit} = await getVenueCheckins(venueId, currentNewestId, null, credentials);
  if (checkins == -1) {
    if (hitMaxAgeLimit) {
      const retry = await getVenueCheckins(venueId, null, null, credentials)
      if (retry.hitMaxAgeLimit) {
        console.error('LB hit max age limit after retrying for venue. Possibly there has been no checkins at this venue for over 10 days')
        return []
      } else {
        return retry.checkins.items.filter(c => c.checkin_id > currentNewestId)
      }
    }
    return [];
  }
  let allCheckins = checkins.items;
  while (currentNewestId != null && checkins.items.length == 25) {
    let lastCheckin = allCheckins[allCheckins.length - 1];
    // untappd's *awesome* API doesn't accept a both a start and end of a range of checkins,
    // it only accepts one or the other. so we have to use the start of the range, and filter
    // ourselves.
    ({checkins} = await getVenueCheckins(venueId, null, lastCheckin.checkin_id, credentials));
    if (checkins == -1) break;
    checkins.items = checkins.items.filter(c => c.checkin_id > currentNewestId);
    allCheckins = allCheckins.concat(checkins.items);
  }
  return allCheckins;
}

const getVenueCheckins = async (venueId, minId, maxId, credentials, isRetrying) => {
  const queryObj = {};
  Object.assign(queryObj, credentials)
  // queryObj.access_token
  // client_id: credentials.client_id,
  // client_secret: credentials.client_secret
  if (minId != null) queryObj.min_id = minId;
  if (maxId != null) queryObj.max_id = maxId;
  const query = qs.stringify(queryObj);
  console.log('querying endpoint', `${API_ENDPOINT}/venue/checkins/${venueId}?${query}`);
  const response = await fetch(`${API_ENDPOINT}/venue/checkins/${venueId}?${query}`);
  const untappdResponse = await response.json();
  if (untappdResponse.meta.code != 200) {
    if (untappdResponse.meta.code == 500 && untappdResponse.meta.error_type == "invalid_param") {
      // can't read any more all checkins beyond are out of reach of the API (>300 || >10 days)
      console.log(Date.now(), '500 hit invalid_param limit');
      console.log(untappdResponse.meta)
      return {checkins: -1};
    } else if (untappdResponse.meta.code == 429) {
      console.log(Date.now(), '429 hit rate limit');
    } else if (untappdResponse.meta.code == 400) {
      console.log(Date.now(), '400 hit max age limit');
      return {checkins: -1, hitMaxAgeLimit: true}
    }
    throw new Error(`Unexpected code from Untappd. Response follows: ${JSON.stringify(untappdResponse, true, ' ')}`);
  }
  return untappdResponse.response;
}

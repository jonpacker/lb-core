const fetch = require('node-fetch');
const qs = require('querystring');
const checkStatus = require('fetch-check-http-status').default;
const { JSDOM } = require('jsdom')
const path = require('path')

const getPathName = url => url ? path.parse(url)?.name : url
module.exports = async (venueId, currentNewestId) => {
  let checkins = await getVenueCheckins(venueId)
  return checkins.filter(checkin => checkin.checkin_id > currentNewestId)

  /*
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
  */
}

const getBeersForVenueId = async (venueId) => {
  const response = await fetch(`https://untappd.com/v/_/${venueId}/activity`)
  const html = await response.text()
  const dom = new JSDOM(html)
  if (!dom?.window) throw new Error('Could not read Untappd response')
  const document = dom.window.document
  const checkinElements = document.querySelectorAll('#main-stream .checkin')
  let checkins = []
  for (const checkinElement of checkinElements) {
    const userElement = checkinElement.querySelector('a.user')
    const beerElement = checkinElement.querySelector('a.user + a')
    const breweryElement = checkinElement.querySelector('a.user + a + a')
    const detailedCheckinLink = checkinElement.querySelector('.bottom a')
    const commentTextElement = checkinElement.querySelector('.comment-text')
    const ratingElement = checkinElement.querySelector('.rating-serving .caps')
    let rating = ratingElement?.getAttribute('data-rating')
    if (rating) rating = parseFloat(rating)
    else rating = null
    const checkin = {
      checkin_id: getPathName(detailedCheckinLink.getAttribute('href')),
      created_at: detailedCheckinLink.getAttribute('data-gregtime'),
      checkin_comment: commentTextElement?.innerHTML,
      rating_score: rating,
      user: {
        user_name: getPathName(userElement.getAttribute('href')),
        user_avatar: checkinElement.querySelector('.avatar-holder img')?.getAttribute('src')
      },
      beer: {
        bid: getPathName(beerElement.getAttribute('href')),
        beer_name: beerElement.innerHTML
      },
      brewery: {
        brewery_id: getPathName(breweryElement.getAttribute('href')),
        brewery_name: breweryElement.innerHTML
      }
    }
    checkins.push(checkin)
  }
  return checkins
}


const getVenueCheckins = async (venueId) => {
  //const queryObj = {};
  //Object.assign(queryObj, credentials)

  /*
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
  */
  return await getBeersForVenueId(venueId);
}

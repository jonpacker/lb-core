const getVenueFeed = require('./read_untappd_feed');
const {PFX} = require('./env.json');

module.exports = async (db, venueId, credentials, defaultFirstCheckin, {PFX}) => {
  let lastUsedCheckinId = await db.get(`${PFX}_${venueId}_latestCheckinId`);
  if (lastUsedCheckinId == null) lastUsedCheckinId = defaultFirstCheckin;
  const checkins = await getVenueFeed(venueId, lastUsedCheckinId, credentials);
  if (checkins.length > 0) await db.set(`${PFX}_${venueId}_latestCheckinId`, checkins[0].checkin_id);
  const beers = checkins.reduce((beers, checkin) => {
    const beer = beers[checkin.beer.bid] || (beers[checkin.beer.bid] = {
      checkins: [],
      beer: checkin.beer,
      brewery: checkin.brewery
    });
    beer.checkins.push({rating: checkin.rating_score});
    return beers;
  }, {});
  await Promise.all(Object.values(beers).map(async ({checkins, beer, brewery}) => {
    const validCheckins = checkins.filter(c => !!c.rating);
    db.multi();
    db.zincrby(`${PFX}_${venueId}_beerGrossCheckinCount`, checkins.length, beer.bid);
    if (validCheckins.length == 0) {
      await db.exec();
      return;
    }
    const sumNewRatings = validCheckins.reduce((s, c) => s + c.rating, 0);
    db.zincrby(`${PFX}_${venueId}_beerValidCheckinCount`, validCheckins.length, beer.bid);
    db.zscore(`${PFX}_${venueId}_beerRatingSet`, beer.bid);
    db.hset(`${PFX}_${venueId}_beerData`, beer.bid, JSON.stringify({beer, brewery}));
    db.incrby(`${PFX}_${venueId}_totalValidCheckinCount`, validCheckins.length);
    db.incrbyfloat(`${PFX}_${venueId}_totalBeerRatingSum`, sumNewRatings); 
    const [, checkinTotal, currentAverage] = await db.exec();
    const newAverage = (sumNewRatings + (checkinTotal - validCheckins.length) * currentAverage) / checkinTotal;
    await db.zadd(`${PFX}_${venueId}_beerRatingSet`, newAverage, beer.bid);
  }));
  return checkins.length;
}

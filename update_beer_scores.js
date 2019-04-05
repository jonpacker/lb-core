const getVenueFeed = require('./read_untappd_feed');
const {PFX} = require('./env.json');

exports.updateBeerScores = async (db, venueId, credentials, defaultFirstCheckin, shouldAcceptBeer) => {
  let lastUsedCheckinId = await db.get(`${PFX}_${venueId}_latestCheckinId`);
  if (lastUsedCheckinId == null) lastUsedCheckinId = defaultFirstCheckin;
  const checkins = await getVenueFeed(venueId, lastUsedCheckinId, credentials);
  if (checkins.length > 0) await db.set(`${PFX}_${venueId}_latestCheckinId`, checkins[0].checkin_id);
  const acceptedCheckins = shouldAcceptBeer ? checkins.filter(shouldAcceptBeer) : checkins
  await updateRedisRatings(db, venueId, null, acceptedCheckins);
  const currentSess = await db.get(`${PFX}_${venueId}_currentSession`);
  if (currentSess) await updateRedisRatings(db, venueId, currentSess, acceptedCheckins);
  if (checkins.length !== acceptedCheckins.length) {
    console.log(`(got ${checkins.length} total, accepted ${acceptedCheckins.length})`)
  }
  return acceptedCheckins.length;
}

exports.setSession = async (db, venueId, session) => {
  await db.set(`${PFX}_${venueId}_currentSession`, session);
  await db.lpush(`${PFX}_${venueId}_sessions`, session);
}

exports.getSessions = async (db, venueId, session) => {
  return await db.lrange(`${PFX}_${venueId}_sessions`, 0, -1) || [];
}

exports.getCurrentSession = async (db, venueId) => {
  return await db.get(`${PFX}_${venueId}_currentSession`)
}

exports.clearSession = async (db, venueId) => {
  await db.del(`${PFX}_${venueId}_currentSession`);
}

const updateRedisRatings = async (db, venueId, sesspfx, checkins) => {
  const getpfx = () => `${PFX}_${venueId}${sesspfx ? `_sess_${sesspfx}` : ''}`
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
    db.zincrby(`${getpfx()}_beerGrossCheckinCount`, checkins.length, beer.bid);
    if (validCheckins.length == 0) {
      await db.exec();
      return;
    }
    const sumNewRatings = validCheckins.reduce((s, c) => s + c.rating, 0);
    db.zincrby(`${getpfx()}_beerValidCheckinCount`, validCheckins.length, beer.bid);
    db.zscore(`${getpfx()}_beerRatingSet`, beer.bid);
    db.hset(`${getpfx()}_beerData`, beer.bid, JSON.stringify({beer, brewery}));
    db.incrby(`${getpfx()}_totalValidCheckinCount`, validCheckins.length);
    db.incrbyfloat(`${getpfx()}_totalBeerRatingSum`, sumNewRatings);
    const [, checkinTotal, currentAverage] = await db.exec();
    const newAverage = (sumNewRatings + (checkinTotal - validCheckins.length) * currentAverage) / checkinTotal;
    await db.zadd(`${getpfx()}_beerRatingSet`, newAverage, beer.bid);
  }));
}

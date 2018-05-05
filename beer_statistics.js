const {PFX} = require('./env.json');
const firstBy = require('thenby');

exports.getBayesianTopRated = async (db, venueId, fetchCount, sesspfx, sortMode) => {
  const getpfx = () => `${PFX}_${venueId}${sesspfx ? `_sess_${sesspfx}` : ''}`;

  db.multi();
  db.get(`${getpfx()}_totalValidCheckinCount`);
  db.get(`${getpfx()}_totalBeerRatingSum`);
  db.zcount(`${getpfx()}_beerRatingSet`, '-inf', '+inf');
  db.zrevrange(`${getpfx()}_beerRatingSet`, 0, -1, 'WITHSCORES');
  const [totalValidCheckinCount, totalBeerRatingSum, totalBeerCount, topRatedBeersRaw] = await db.exec();
  const topRatedBeers = topRatedBeersRaw.reduce((beers, val, i) => {
    if (i % 2 == 0) beers.push({bid: val});
    else beers[beers.length - 1].rollingAverageRating = parseFloat(val);
    return beers;
  }, []);

  if (topRatedBeers.length == 0) return [];

  db.multi();
  // get beer data
  db.hmget(`${getpfx()}_beerData`, topRatedBeers.map(b => b.bid));
  for (let beer of topRatedBeers) db.zscore(`${getpfx()}_beerValidCheckinCount`, beer.bid);
  for (let beer of topRatedBeers) db.zscore(`${getpfx()}_beerGrossCheckinCount`, beer.bid);

  const beerMetadata = await db.exec();
  const averageRatingCount = totalValidCheckinCount / totalBeerCount;
  const averageRating = totalBeerRatingSum / totalValidCheckinCount;
  topRatedBeers.forEach((beer, i) => {
    const metadata = JSON.parse(beerMetadata[0][i]);
    beer.beer = metadata.beer;
    beer.brewery = metadata.brewery;
    beer.validCheckinCount = parseInt(beerMetadata[i + 1]);
    beer.grossCheckinCount = parseInt(beerMetadata[i * 2 + 1]);
    beer.bayesianRating = (averageRatingCount * averageRating + beer.validCheckinCount * beer.rollingAverageRating) / (averageRatingCount + beer.validCheckinCount);
  });
  if (sortMode == 'checkins') {
    topRatedBeers.sort(
      firstBy('bayesianRating', -1)
      .thenBy('validCheckinCount')
      .thenBy('grossCheckinCount')
      .thenBy(b => b.beer.beer_name)
    );
  } else {
    topRatedBeers.sort(
      firstBy('grossCheckinCount')
      .thenBy(b => b.beer.beer_name)
    );
  }

  return topRatedBeers.slice(0, fetchCount);
}

exports.getTopRated = async (db, venue, count, sesspfx) => {
  return await exports.getBayesianTopRated(db, venue, count, sesspfx);
}

exports.getTopCheckedIn = async (db, venue, count, sesspfx) => {
  return await exports.getBayesianTopRated(db, venue, count, sesspfx, 'checkins');
}

const {PFX} = require('./env.json');
const firstBy = require('thenby');

exports.getBayesianTopRated = async (db, venueId, fetchCount, credentials) => {
  db.multi();
  db.get(`${PFX}_${venueId}_totalValidCheckinCount`);
  db.get(`${PFX}_${venueId}_totalBeerRatingSum`);
  db.zcount(`${PFX}_${venueId}_beerRatingSet`, '-inf', '+inf');
  db.zrevrange(`${PFX}_${venueId}_beerRatingSet`, 0, fetchCount - 1, 'WITHSCORES');
  const [totalValidCheckinCount, totalBeerRatingSum, totalBeerCount, topRatedBeersRaw] = await db.exec();
  const topRatedBeers = topRatedBeersRaw.reduce((beers, val, i) => {
    if (i % 2 == 0) beers.push({bid: val});
    else beers[beers.length - 1].rollingAverageRating = parseFloat(val);
    return beers;
  }, []);
  
  db.multi();
  // get beer data
  db.hmget(`${PFX}_${venueId}_beerData`, topRatedBeers.map(b => b.bid));
  for (let beer of topRatedBeers) db.zscore(`${PFX}_${venueId}_beerValidCheckinCount`, beer.bid);
  for (let beer of topRatedBeers) db.zscore(`${PFX}_${venueId}_beerGrossCheckinCount`, beer.bid);

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
  topRatedBeers.sort(
    firstBy('bayesianRating', -1)
    .thenBy('validCheckinCount')
    .thenBy('grossCheckinCount')
    .thenBy(b => b.beer.beer_name)
  );

  return topRatedBeers;
}

exports.getTopRated = async app => {
  return (await exports.getBayesianTopRated(app.db, app.config.venue_id, 30, app.utcred));
}

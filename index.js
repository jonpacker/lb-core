const {updateBeerScores, getCurrentSession,setSession, clearSession, getSessions} = require('./update_beer_scores')
module.exports = {
  updateBeerScores, setSession, clearSession, getSessions, getCurrentSession,
  stats: require('./beer_statistics'),
  reader: require('./read_untappd_feed')
}

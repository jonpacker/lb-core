const {updateBeerScores, getCurrentSession,setSession, clearSession, getSessions} = require('updateBeerScores')
module.exports = {
  updateBeerScores, setSession, clearSession, getSessions, getCurrentSession, 
  stats: require('./beer_statistics'),
  reader: require('./read_untappd_feed')
}

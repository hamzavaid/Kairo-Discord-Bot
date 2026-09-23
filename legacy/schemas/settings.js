const mongoose = require('mongoose')

const reqString = {
  type: String,
  required: true,
}

const reqNumber = {
  type: Number,
  required: true
}

const reqArray = {
  type: Array,
  required: true
}

const reqBoolen = {
  type: Boolean,
  required: true
}

const welcomeSchema = mongoose.Schema({
  dev: reqString,
  GuildID: reqString,
  prefix: reqString,
  blacklist: reqArray,
  djrole: reqArray,
  djonly: reqBoolen,
  defaultvolume: reqNumber
})

module.exports = mongoose.model('settings', welcomeSchema)
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

const reqObj = {
  type: Object,
  required: true
}

const welcomeSchema = mongoose.Schema({
  author: reqString,
  embeds: reqArray,
})

module.exports = mongoose.model('savedembeds', welcomeSchema)
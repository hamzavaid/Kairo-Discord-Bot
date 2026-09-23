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
  server: reqString,
  commands: reqArray
})

module.exports = mongoose.model('auditlogs', welcomeSchema)
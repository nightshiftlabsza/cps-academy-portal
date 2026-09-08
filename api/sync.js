'use strict';

// Vercel Serverless Function entrypoint for Version 1 sync contract
const { defaultHandler } = require('./_lib/sync-contract.cjs');

module.exports = async function handler(req, res) {
  return defaultHandler(req, res);
};

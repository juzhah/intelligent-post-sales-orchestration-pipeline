const { scraper_api_token, cf_account_id } = require("../utils/config.js");
const axios = require("axios");
const { urlNormalizer } = require("../utils/utils");
const CFError = require("../customErrors/CFError.js");
const {
  CF_FAILED_SCRAPING,
  CF_FAILED_CREATE_JOB,
} = require("../constants/errorCodes.js");

const CF_CRAWL_API = `https://api.cloudflare.com/client/v4/accounts/${cf_account_id}/browser-rendering/crawl`;

async function cfScraper(domain) {
  const baseUrl = urlNormalizer(domain);

  /*
   * Paso 1) Crear un Crawl Job
   */
  let response;
  try {
    response = await axios.post(
      CF_CRAWL_API,
      {
        url: baseUrl,
        render: false,
        limit: 10 /* default */,
        formats: ["json"],
        jsonOptions: {
          prompt:
            "You are analyzing a B2B company website to support an onboarding briefing. Extract the company's industry vertical, company size indicators (headcount ranges, growth stage, or market tier), key products or services offered, and any detectable tech stack (frameworks, platforms, tools mentioned in the page source or content). Return only what is explicitly present — do not fabricate.",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "scraped_client_context",
              properties: {
                industry: { type: "string" },
                companySizeIndicator: { type: "string" },
                keyServices: { type: "array", items: { type: "string" } },
                techStack: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
              },
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${scraper_api_token}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    throw new CFError(
      CF_FAILED_CREATE_JOB,
      error.response?.data?.errors?.[0]?.message,
      422,
    );
  }

  /* Need to validate if successful -> result = jobID */
  if (!response.data.success) {
    console.log(response.data.errors?.[0]?.message);
    throw new CFError(
      CF_FAILED_CREATE_JOB,
      response.data.errors?.[0]?.message,
      422,
    );
  }

  const jobId = response.data.result;

  /*
   * Paso 2) Poll Job to check status
   */
  const scrappedData = await waitForCrawl(jobId);

  if (!scrappedData.success) {
    console.log(scrappedData.errors?.[0]?.message);
    throw new CFError(
      CF_FAILED_SCRAPING,
      scrappedData.errors?.[0]?.message,
      422,
    );
  }

  return scrappedData.result;
}

async function waitForCrawl(jobId) {
  const maxAttempts = 60;
  const delayMs = 5000;
  console.log("Fetching job with id: " + jobId);

  for (let i = 0; i < maxAttempts; i++) {
    /* TODO: custom error response instead of AxiosResponse in case of network or service failure */
    const response = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${cf_account_id}/browser-rendering/crawl/${jobId}?limit=1`,
      {
        headers: {
          Authorization: `Bearer ${scraper_api_token}`,
        },
      },
    );

    const data = response.data;
    const status = data.result.status;

    if (status !== "running") {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Crawl job did not complete within timeout");
}

module.exports = cfScraper;

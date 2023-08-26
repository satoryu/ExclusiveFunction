const { setTimeout } = require("timers/promises");
const { BlobServiceClient } = require("@azure/storage-blob");

module.exports = async function (context, req) {
  context.log("JavaScript HTTP trigger function processed a request.");

  const name = req.query.name || "Someone";
  const lockBlobName = `${name}.lock`;

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env["AzureWebJobsStorage"]
  );
  const containerClient = blobServiceClient.getContainerClient("lock");
  const blobClient = containerClient.getBlobClient(lockBlobName);

  await blobClient.exists().then(async (exists) => {
    if (!exists) {
      context.log(`${lockBlobName} does not exists`);
      await containerClient
        .getBlockBlobClient(lockBlobName)
        .uploadData(Buffer.from("locked"));
    }
  });

  const leaseClient = blobClient.getBlobLeaseClient();

  let lease = null;
  for (let i = 0; i < 100; i++) {
    console.log(`Attempt ${i}`);
    try {
      // Try to acquire a lease for 15 seconds
      lease = await leaseClient.acquireLease(1);

      context.log(`Lease ID: ${lease.leaseId}`);
      // If the lease is acquired successfully, break out of the loop
      break;
    } catch (err) {
      // If there's an error acquiring the lease, log a warning and wait for 200ms before trying again
      if (err.statusCode >= 400 && err.statusCode < 500) {
        context.log.warn(err);
        await setTimeout(200);
        continue;
      }
    }
  }

  if (!lease) {
    context.log.error("Failed to acquire lease");
    return;
  }

  for (let i = 0; i < 5; i++) {
    context.log(`${name} : ${i}`);
    await setTimeout(1000);
  }

  const responseMessage = `Hello World! ${name}`;

  context.res = {
    // status: 200, /* Defaults to 200 */
    body: responseMessage,
  };

  // Release the lease
  await leaseClient.releaseLease(lease.leaseId);
};

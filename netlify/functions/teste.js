module.exports.handler = async function(event) {
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ok: true,
      method: event.httpMethod,
      body: event.body,
      msg: "function funcionando!"
    })
  };
};

// Simple JSON endpoint to confirm API is reachable
module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    now: new Date().toISOString(),
    accept: req.headers.accept || ""
  });
};

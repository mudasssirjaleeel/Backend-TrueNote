const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  if (process.env.NODE_ENV === 'development') {
    console.error(`[${status}] ${req.method} ${req.path} — ${err.message}`);
  }

  if (err.code === 'P2002')
    return res.status(409).json({ message: 'A record with this value already exists' });

  if (err.code === 'P2025')
    return res.status(404).json({ message: 'Record not found' });

  res.status(status).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
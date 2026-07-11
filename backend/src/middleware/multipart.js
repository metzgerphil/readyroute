function parseMultipartForm(req, res, next) {
  const maximumBytes = 12 * 1024 * 1024;
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);

  if (!contentType.startsWith('multipart/form-data') || !boundaryMatch) {
    return res.status(400).json({ error: 'multipart/form-data with a boundary is required' });
  }

  const declaredBytes = Number(req.headers['content-length']);
  if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) {
    return res.status(413).json({ error: 'Upload must be 12 MB or smaller.' });
  }

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const chunks = [];
  let receivedBytes = 0;
  let rejected = false;

  req.on('data', (chunk) => {
    if (rejected) {
      return;
    }

    receivedBytes += chunk.length;
    if (receivedBytes > maximumBytes) {
      rejected = true;
      chunks.length = 0;
      res.status(413).json({ error: 'Upload must be 12 MB or smaller.' });
      return;
    }

    chunks.push(chunk);
  });

  req.on('end', () => {
    if (rejected) {
      return;
    }
    try {
      const bodyBuffer = Buffer.concat(chunks);
      const body = bodyBuffer.toString('latin1');
      const parts = body.split(boundary).slice(1, -1);
      const fields = {};
      let file = null;
      const files = {};

      for (const part of parts) {
        const trimmedPart = part.replace(/^\r\n/, '').replace(/\r\n$/, '');
        if (!trimmedPart) {
          continue;
        }

        const separatorIndex = trimmedPart.indexOf('\r\n\r\n');
        if (separatorIndex === -1) {
          continue;
        }

        const rawHeaders = trimmedPart.slice(0, separatorIndex);
        const rawContent = trimmedPart.slice(separatorIndex + 4);
        const disposition = rawHeaders.match(/name="([^"]+)"(?:; filename="([^"]+)")?/i);

        if (!disposition) {
          continue;
        }

        const fieldName = disposition[1];
        const filename = disposition[2];
        const content = rawContent.replace(/\r\n$/, '');

        if (filename) {
          const parsedFile = {
            fieldname: fieldName,
            originalname: filename,
            mimetype: (rawHeaders.match(/content-type:\s*([^\r\n]+)/i) || [])[1] || 'application/octet-stream',
            buffer: Buffer.from(content, 'latin1')
          };
          if (fieldName === 'file' || !file) {
            file = parsedFile;
          }
          files[fieldName] = parsedFile;
        } else {
          fields[fieldName] = content;
        }
      }

      req.body = fields;
      req.file = file;
      req.files = files;
      next();
    } catch (error) {
      next(error);
    }
  });

  req.on('error', (error) => {
    next(error);
  });
}

module.exports = {
  parseMultipartForm
};

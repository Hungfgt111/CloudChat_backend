exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Vui lòng chọn tệp tin hợp lệ' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    return res.status(201).json({
      success: true,
      message: 'Tải tệp tin lên thành công',
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        fileUrl,
      },
    });
  } catch (error) {
    console.error('[FileController Error]:', error);
    return res.status(500).json({ error: error.message });
  }
};

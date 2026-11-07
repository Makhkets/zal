import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, LoaderCircle } from 'lucide-react';

export default function PaymentQr({ url }: { url: string | null }) {
  const [image, setImage] = useState<{ url: string; data: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setImage(null); setFailed(false);
    if (url) QRCode.toDataURL(url, { width: 768, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#101014', light: '#ffffff' } })
      .then(data => { if (alive) setImage({ url, data }); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [url]);
  const ready = image?.url === url ? image : null;
  return <div className="payment-qr">
    <div className="payment-qr-code">
      {ready ? <img src={ready.data} width="256" height="256" alt="QR-код СБП для оплаты этого заказа" /> :
        <div className="payment-qr-wait" role="status"><LoaderCircle className="checkout-spin" size={28} aria-hidden="true" /><span>{failed ? 'Не удалось показать QR' : 'Ожидаем QR от банка'}</span></div>}
    </div>
    <p>{ready ? 'Отсканируйте в приложении банка. После оплаты билет появится здесь автоматически.' : 'Можно подождать или открыть платёжную форму по ссылке ниже.'}</p>
    {ready && <a className="payment-qr-save" href={ready.data} download="zal-payment-qr.png"><Download size={15} aria-hidden="true" />Сохранить QR для приложения банка</a>}
  </div>;
}

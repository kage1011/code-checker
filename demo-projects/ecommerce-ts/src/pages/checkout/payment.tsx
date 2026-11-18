import React, { useState } from 'react';

export default function CheckoutPayment() {
  const [order, setOrder] = useState<any>(null);

  const handlePay = () => {
    // 1. Critical: Hardcoded localhost in production
    fetch('http://localhost:5000/api/checkout/pay');

    // 2. Critical: Leftover debugger
    debugger;

    // 3. Warning: Unsafe as any cast
    const customer = (order as any).customerName;

    // 4. Info: console.log leftover
    console.log('Customer charged:', customer);
  };

  return (
    <div>
      <h1>Checkout Payment Page</h1>
      <button onClick={handlePay}>Thanh toán ngay</button>
    </div>
  );
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // PAYMONGO_SECRET_KEY is set in Netlify → Site Settings → Environment Variables
    const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET_KEY;
    const SITE_URL = process.env.SITE_URL || 'https://YOUR_SITE.netlify.app';

    let body;
    try {
        body = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { mode, amount } = body;

    // Validate inputs
    const validAmounts = [20, 50, 100];
    if (mode === 'one_time' && !validAmounts.includes(amount)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid amount' }) };
    }
    if (mode !== 'one_time' && mode !== 'monthly') {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid mode' }) };
    }

    // PayMongo uses centavos (multiply PHP by 100)
    const amountInCentavos = amount * 100;

    const authHeader = 'Basic ' + Buffer.from(PAYMONGO_SECRET + ':').toString('base64');

    try {
        // Step 1 — Create a PayMongo Checkout Session
        // Docs: https://developers.paymongo.com/reference/create-a-checkout
        const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        billing: {
                            name: 'KEi Supporter',
                        },
                        send_email_receipt: false,
                        show_description: true,
                        show_line_items: true,
                        cancel_url:  `${SITE_URL}/?donated=cancelled`,
                        success_url: `${SITE_URL}/?donated=true`,
                        description: mode === 'monthly'
                            ? 'Monthly support for KEi\'s Arduino & Robotics projects'
                            : 'One-time support for KEi\'s Arduino & Robotics projects',
                        line_items: [{
                            currency: 'PHP',
                            amount: amountInCentavos,
                            description: mode === 'monthly'
                                ? 'Monthly Build Support (₱20/mo)'
                                : `Fund the Build — ₱${amount}`,
                            name: 'FUND_THE_BUILD',
                            quantity: 1,
                        }],
                        // Enable GCash, Maya, and card payments
                        payment_method_types: [
                            'gcash',
                            'paymaya',
                            'card',
                            'grab_pay',
                        ],
                    },
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            const errMsg = data?.errors?.[0]?.detail || 'PayMongo API error';
            throw new Error(errMsg);
        }

        // Return the PayMongo hosted checkout URL to the frontend
        const checkoutUrl = data.data.attributes.checkout_url;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkoutUrl }),
        };

    } catch (err) {
        console.error('PayMongo error:', err.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};

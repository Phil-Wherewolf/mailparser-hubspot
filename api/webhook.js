// Forcing a new deployment to read env variables
const axios = require('axios');

module.exports = async (req, res) => {
  // --- DEBUGGING LINE ---
  // This will show us all the environment variables the function can see.
  console.log('Available Environment Keys:', Object.keys(process.env));
  console.log('HUBSPOT TOKEN VALUE:', process.env.HUBSPOT_ACCESS_TOKEN ? 'Token exists ✅' : 'Token MISSING ❌');
  // --- END DEBUGGING LINE ---

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get HubSpot token from environment variable
    const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
    
    if (!HUBSPOT_TOKEN) {
      console.error('Missing HubSpot access token');
      return res.status(500).json({ error: 'Configuration error' });
    }

    // Extract data from Mailparser
    const {
      pool_id,
      business_name,
      full_name,
      email_address: email
    } = req.body;

    console.log('Received signup:', { pool_id, business_name, full_name, email });

    // Validate required fields
    if (!email || !full_name || !business_name || !pool_id) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        received: { pool_id, business_name, full_name, email }
      });
    }

    // Split name into first and last
    const nameParts = full_name.trim().split(' ');
    const firstname = nameParts[0];
    const lastname = nameParts.slice(1).join(' ') || '';

    // Step 1: Create or update contact
    const contactData = {
      properties: {
        email: email,
        firstname: firstname,
        lastname: lastname,
        company: business_name,
        pool_id__phil_only_: pool_id,
        source__latest_: 'Lite Sign up'
      }
    };

    // Search for existing contact
    const searchUrl = 'https://api.hubapi.com/crm/v3/objects/contacts/search';
    const headers = {
      'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json'
    };

    const searchResponse = await axios.post(searchUrl, {
      filterGroups: [{
        filters: [{
          propertyName: 'email',
          operator: 'EQ',
          value: email
        }]
      }]
    }, { headers });

    let contactId;
    let contactAction;

    if (searchResponse.data.results.length > 0) {
      // Update existing contact
      contactId = searchResponse.data.results[0].id;
      await axios.patch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
        contactData,
        { headers }
      );
      contactAction = 'updated';
    } else {
      // Create new contact
      const createResponse = await axios.post(
        'https://api.hubapi.com/crm/v3/objects/contacts',
        contactData,
        { headers }
      );
      contactId = createResponse.data.id;
      contactAction = 'created';
    }

    // Success response
    res.status(200).json({
      success: true,
      message: `Contact ${contactAction}`,
      data: {
        contactId,
        pool_id,
        email
      }
    });

  } catch (error) {
    console.error('Webhook error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
};

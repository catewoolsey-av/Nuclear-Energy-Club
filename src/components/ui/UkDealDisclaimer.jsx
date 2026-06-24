import React from 'react';

// UK regulatory disclaimer shown on UK deals (deal.is_uk === true).
// Wording is the source of truth in the Deal-Room repo's ukDisclaimerHtml();
// keep this in sync if that text changes. Rendered as a small, gray,
// end-of-card footnote — placed UNDER the Invest/Pass decision UI when it is
// present, and on its own when it is not (closed / not-yet-activated deals).
export const UkDealDisclaimer = ({ className = '' }) => (
  <aside
    role="note"
    aria-label="UK regulatory disclaimer"
    className={`uk-disclaimer text-xs text-gray-500 leading-relaxed ${className}`}
  >
    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
      UK Regulatory Disclaimer
    </div>
    <p className="mb-2">
      Any performance data/information shared in this content should not be seen as an indicator or guarantee of future performance. This communication is exempt from the general restriction (in section 21 of the Act) on the communication of invitations or inducements to engage in investment activity on the ground that it is made to a High Net Worth Individual, Self-Certified Sophisticated Investor or Investment Professional that meets the requirements in Section 48, 50A, or 19 of The Financial Services and Markets Act 2000 (Financial Promotion) Order 2005. If you are a person of any other description, you should not rely upon the contents of this communication. If you are in doubt about the investment to which the communication relates you should consult an authorised person specialising in advising on investments of the kind in question. Please note that:
    </p>
    <ul className="list-disc pl-5 space-y-1 mb-2">
      <li>You are not a client of Alumni Ventures UK, LLP;</li>
      <li>Alumni Ventures UK, LLP is not advising you on any transaction that arises from this promotion; and</li>
      <li>Alumni Ventures UK, LLP is not responsible to you for providing protections afforded to clients.</li>
    </ul>
    <p className="mb-2">
      Alumni Ventures UK, LLP (FRN 1051965) is an Appointed Representative of Khepri Advisers Limited (FRN 692447) which is authorised and regulated by the Financial Conduct Authority. Khepri Advisers Limited is registered in England and Wales, registered address 95 Chancery Lane, London, WC2A 1DT.
    </p>
    <p>
      Alumni Ventures UK, LLP is a limited liability partnership registered in England and Wales with registration number OC458068. Its registered office is at Dns House, 382 Kenton Road, Harrow, Middlesex, United Kingdom, HA3 8DP. Alumni Ventures UK, LLP does not offer any investment advice and no communication, through this website or in any other medium, should be construed as advice or a personal recommendation. If you are unsure about whether or not to invest you should speak to a financial adviser.
    </p>
  </aside>
);

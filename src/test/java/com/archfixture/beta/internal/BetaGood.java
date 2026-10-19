package com.archfixture.beta.internal;

import com.archfixture.alpha.api.AlphaApi;

/** Fixture: correct usage - module 'beta' depends on 'alpha' through its api package only. */
public class BetaGood {
    AlphaApi alpha;
}

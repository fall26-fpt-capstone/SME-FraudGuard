package com.archfixture.beta.internal;

import com.archfixture.alpha.internal.AlphaSecret;

/** Fixture: VIOLATION - module 'beta' reaching into module 'alpha'.internal. */
public class BetaViolator {
    AlphaSecret secret = new AlphaSecret();
}

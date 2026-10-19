package com.fraudguard.aiclient;

import java.util.List;

/** JSON response of the AI scoring service. {@code score} is a fraud probability in [0, 1]. */
public record ScoringResponse(
        double score,
        List<String> reasons,
        String modelVersion
) {
}

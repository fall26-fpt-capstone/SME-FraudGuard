package com.fraudguard.workspace.dto.request;

import jakarta.validation.constraints.*;
import java.util.UUID;

public record StaffAssignmentRequest(@NotNull UUID staffId, @NotNull @PositiveOrZero Long version) { }

-- The profile page must always receive an employee-specific background.
ALTER TABLE "card_page_default_backgrounds"
    ADD CONSTRAINT "card_page_default_backgrounds_no_profile_check"
    CHECK ("page" <> 'profile');

<?php

namespace App\Services;
use DateTime;
use NumberFormatter;

final class PdfFormMapper
{
    private const CHECKED_VALUE = 'Yes';
    private const UNCHECKED_VALUE = 'Off';

    private static function checkbox(bool $checked): string
    {
        return $checked ? self::CHECKED_VALUE : self::UNCHECKED_VALUE;
    }

    private static function addressLines(?string $addr): array
    {
        $addr = trim((string)($addr ?? ''));
        if ($addr === '') return ['', ''];

        // explicit newlines if present
        if (str_contains($addr, "\n")) {
            $parts = preg_split("/\r\n|\n|\r/", $addr);
            $l1 = $parts[0] ?? '';
            $l2 = $parts[1] ?? '';
            return [trim($l1), trim($l2)];
        }

        // keep all on first line
        return [$addr, ''];
    }

    private static function getAge(string $birth_date): string
    {   

        if ($birth_date === '') return '';
        $bday = new DateTime($birth_date);
        $today = new DateTime();

        $diff = $today->diff($bday);

        return $diff->y;
    }

    private static function formatMoney(string $amount): string
    {
        if ($amount === '') return '';
        $fmt = new NumberFormatter('en_PH', NumberFormatter::CURRENCY);
        $fmt->setSymbol(NumberFormatter::CURRENCY_SYMBOL, '₱');
        return  $fmt->formatCurrency((float)$amount, 'PHP'); 
    }

    public static function mapA(array $form): array
    {   
        $declarant = $form['declarant']['personal_information'] ?? $form['declarant']?? [];
        $spouse = $form['spouse']['personal_information'] ?? $form['spouse'] ?? [];
        $additional_spouses = $form['additional_spouses'] ?? [];
        $children = $form['children_below_18'] ?? $form['children'] ?? [];
        $real_properties = $form['assets']['real_properties'] ?? $form['real_properties'] ?? [];
        $personal_properties = $form['assets']['personal_properties'] ?? $form['personal_properties'] ?? [];
        
        $temp = $form['business_interests'] ?? ['has_business_interest' => false, 'entries' => []];
        $business_interests = $temp['entries'] ?? $form['business_interests'] ?? [];
        
        $temp2 = $form['relatives_in_government'] ?? ['has_relatives' => false, 'entries' => []];
        $rel_in_govt_service = $temp2 ?? $form['relatives_in_government_service'] ?? [];
        
        $liabilities = $form['liabilities'] ?? [];

        [$decAddr1, $decAddr2] = self::addressLines($declarant['office_address'] ?? '');
        [$spAddr1, $spAddr2]   = self::addressLines($spouse['office_address']?? '');

        $filingType = $form['form_metadata']['filing_type'] ?? $form['filing_type'] ?? '';

        $pdf = [
            // form metadata (ie just the top part)
            "assumption_of_office"           => $form['assumption_date'] ?? $form['as_of_date'] ?? '',   
            "annual_filing"                  => (new DateTime('last year'))->format('Y'),
            "exit"                           => $form['exit_date'] ?? '',

            // checkboxes
            'assumption_of_office_check_box' => self::checkbox(($form['assumption_date'] ?? '') !== ''),
            'annual_filing_check_box'        => self::checkbox(true),
            'exit_check_box'                 => self::checkbox(($form['exit_date'] ?? '') !== ''),
            'joint_filing_check_box'         => self::checkbox($filingType === 'JOINT' || $filingType === 'joint'),
            'sep_filing_check_box'           => self::checkbox($filingType === 'SEPERATE' || $filingType === 'seperate'),
            'filing_not_applicable_check_box'     => self::checkbox($filingType === 'NOT_APPLICABLE' || $filingType === 'not_applicable'),
            'mult_spouse_not_applicable_check_box'=> self::checkbox($spouse === null || $spouse === []),
            'business_check_box'  => self::checkbox($business_interests !== null || $business_interests !== []),
            'relatives_check_box' => self::checkbox($rel_in_govt_service !== null || $rel_in_govt_service !== []),

            // declarant
            'declarant_family_name'      => $declarant['family_name'] ?? $declarant['last_name'] ?? '',
            'declarant_first_name'       => $declarant['first_name'] ?? '',
            'declarant_mi'               => $declarant['middle_initial'] ?? '',
            'declarant_position'         => $declarant['position'] ?? '',
            'declarant_agency_office'    => $declarant['agency_office'] ?? '',
            'declarant_office_addr_r1'   => $decAddr1 ?? '',
            'declarant_office_addr_r2'   => $decAddr2 ?? '',

            // spouse
            'spouse_family_name'   => $spouse['family_name'] ?? $spouse['last_name'] ?? '',
            'spouse_first_name'    => $spouse['first_name'] ?? '',
            'spouse_mi'            => $spouse['middle_initial'] ?? '',
            'spouse_position'      => $spouse['position'] ?? '',
            'spouse_agency_office' => $spouse['agency_office'] ?? '',
            'spouse_office_addr'   => $spouse['office_address'] ?? '',

        ];

        // mult spouses
        // TODO more than 2 spouses (annex a?)
        for ($i =0;$i<2;$i++) {
            $row = $additional_spouses[$i] ?? [];

            if ($row === []){
                break;
            }
            $r = $i +1;
            $pdf["mult_spouse_r{$r}"] = $row['name'] ?? '';
        }

        //children
        for ($i =0;$i<3;$i++) {
            $row = $children[$i] ?? [];

            if ($row === []){
                break;
            }
            $r = $i +1;
            $pdf["umarried_children_name_r{$r}"] = $row['name'] ?? '';
            $pdf["umarried_children_age_r{$r}"] = $row['age'] ?? self::getAge($row['date_of_birth'] ?? '');
        }

        // real propts
        $realPropts_total = 0.0;
        for ($i = 0; $i < 4; $i++) {
            $row = $real_properties[$i] ?? [];

            if ($row === []){
                break;
            }
            $r = $i + 1;
            
            $pdf["real_properties_r{$r}c1"] = $row['description'] ?? '';
            $pdf["real_properties_r{$r}c2"] = $row['kind'] ?? '';
            $pdf["real_properties_r{$r}c3"] = $row['exact_location'] ?? '';
            $pdf["real_properties_r{$r}c4"] = self::formatMoney($row['assessed_value'] ?? '');
            $pdf["real_properties_r{$r}c5"] = self::formatMoney($row['current_fair_market_value'] ?? $row['fair_market_value'] ?? '');

            $temp = $row['acquisition'] ?? [];
            $pdf["real_properties_r{$r}c6"] = $row['year_of_acquisition'] ?? $temp['year'] ?? '';
            $pdf["real_properties_r{$r}c7"] = $row['mode_of_acquisition'] ?? $temp['mode'] ?? '';

            $realPropts_total += (float)($row['acquisition_cost'] ?? 0.0);
            $realPropts_total += (float)($temp['cost'] ?? 0.0);
            $pdf["real_properties_r{$r}c8"] = self::formatMoney($row['acquisition_cost'] ?? $temp['cost'] ?? '');
        }

        //personal propts
        $personalPropts_total = 0.0;
        for ($i = 0; $i < 6; $i++) {
            $row = $personal_properties[$i] ?? [];

            if ($row === []){
                break;
            }

            $r = $i + 1;

            $pdf["personal_properties_r{$r}c1"] = $row['description'] ?? '';
            $pdf["personal_properties_r{$r}c2"] = $row['acquisition_year'] ?? '';
            $personalPropts_total += (float)($row['acquisition_cost_amount'] ?? 0.0);
            $personalPropts_total += (float)($row['acquisition_cost'] ?? 0.0);
            $pdf["personal_properties_r{$r}c3"] = self::formatMoney($row['acquisition_cost_amount'] ?? $row['acquisition_cost'] ?? '');
        }

        // liabilites
        $liabilities_total = 0.0;
        for ($i = 0; $i < 4; $i++) {
            $row = $liabilities[$i] ?? [];
            if ($row === []){
                break;
            }
            $r = $i + 1;
            // echo "hi from liabilties\n";
            $pdf["liabilities_r{$r}c1"] = $row['nature'] ?? '';
            $pdf["liabilities_r{$r}c2"] = $row['name_of_creditor'] ?? $row['creditor_name'] ?? '';
            $liabilities_total += (float)($row['outstanding_balance'] ?? 0.0);
            $pdf["liabilities_r{$r}c3"] = self::formatMoney($row['outstanding_balance'] ?? '');
        }

        // business interests
        for ($i = 0; $i < 3; $i++) {
            $row = $business_interests[$i] ?? [];
            if ($row === []){
                break;
            }
            $r = $i + 1;

            $pdf["business_r{$r}c1"] = $row['name_of_entity_or_business_enterprise'] ?? $row['entity_name'] ?? '';
            $pdf["business_r{$r}c2"] = $row['business_address'] ?? '';
            $pdf["business_r{$r}c3"] = $row['nature_of_business_interest_or_financial_connection'] ?? $row['nature_of_interest'] ?? '';
            $pdf["business_r{$r}c4"] = $row['date_of_acquisition'] ?? $row['date_acquired'] ?? '';
        }

        // relatives
        for ($i = 0; $i < 5; $i++) {
            $row = $rel_in_govt_service[$i] ?? [];
            if ($row === []){
                break;
            }
            $r = $i + 1;

            $pdf["relatives_r{$r}c1"] = $row['name_of_relative'] ?? $row['relative_name'] ?? '';
            $pdf["relatives_r{$r}c2"] = $row['relationship'] ?? '';
            $pdf["relatives_r{$r}c3"] = $row['position'] ?? '';
            $pdf["relatives_r{$r}c4"] = $row['name_of_agency_office_and_address'] ?? $row['agency_office'] ?? '';
        }

        // subtotals and totals
        $pdf['real_properties_subtotal']     = self::formatMoney((string)$realPropts_total);
        $pdf['personal_properties_subtotal'] = self::formatMoney((string)$personalPropts_total);
        $pdf['total_assets']                 = self::formatMoney((string)($realPropts_total + $personalPropts_total));
        $pdf['total_liabilities']            = self::formatMoney((string)$liabilities_total);
        $pdf['net_worth']                    = self::formatMoney((string)($realPropts_total + $personalPropts_total - $liabilities_total));

        return $pdf;
    }
    public static function mapB(array $form): array
    {
        $declarant = $form['declarant']['personal_information'] ?? $form['declarant']?? [];
        $real_properties = $form['assets']['real_properties'] ?? $form['real_properties'] ?? [];
        $personal_properties = $form['assets']['personal_properties'] ?? $form['personal_properties'] ?? [];
        $temp = $form['business_interests'] ?? ['has_business_interest' => false, 'entries' => []];
        $business_interests = $temp['entries'] ?? $form['business_interests'] ?? [];
        $liabilities = $form['liabilities'] ?? [];

        $pdf = [
            // declarant
            'family_name'      => $declarant['family_name'] ?? $declarant['last_name'] ?? '',
            'first_name'       => $declarant['first_name'],
            'family_name_2'    => $declarant['middle_initial'],
            'position'         => $declarant['position'],
            'agency_office'    => $declarant['agency_office'],
            'as_of'            => new DateTime('last year december 31')->format('F j, Y'),

        ];

        // real propts
        $realPropts_total = 0.0;
        for ($i = 0; $i < 4; $i++) {
            $row = $real_properties[$i] ?? [];

            if ($row === []){
                break;
            }
            $r = $i + 1;
            
            $pdf["real_properties_r{$r}c1"] = $row['description'] ?? '';
            $pdf["real_properties_r{$r}c2"] = $row['kind'] ?? '';
            $pdf["real_properties_r{$r}c3"] = $row['exact_location'] ?? '';
            $pdf["real_properties_r{$r}c4"] = self::formatMoney($row['assessed_value'] ?? '');
            $pdf["real_properties_r{$r}c5"] = self::formatMoney($row['current_fair_market_value'] ?? $row['fair_market_value'] ?? '');


            $temp = $row['acquisition'] ?? [];
            $pdf["real_properties_r{$r}c6"] = $row['year_of_acquisition'] ?? $temp['year'] ?? '';
            $pdf["real_properties_r{$r}c7"] = $row['mode_of_acquisition'] ?? $temp['mode'] ?? '';


            $realPropts_total += (float)($row['acquisition_cost'] ?? 0.0);
            $realPropts_total += (float)($temp['cost'] ?? 0.0);
            $pdf["real_properties_r{$r}c8"] = self::formatMoney($row['acquisition_cost'] ?? $temp['cost'] ?? '');
            
        }

        //personal propts
        $personalPropts_total = 0.0;
        for ($i = 0; $i < 4; $i++) {
            $row = $personal_properties[$i] ?? [];

            if ($row === []){
                break;
            }

            $r = $i + 1;

            $pdf["personal_properties_r{$r}c1"] = $row['description'] ?? '';
            $pdf["personal_properties_r{$r}c2"] = $row['acquisition_year'] ?? '';
            $personalPropts_total += (float)($row['acquisition_cost_amount'] ?? 0.0);
            $personalPropts_total += (float)($row['acquisition_cost'] ?? 0.0);
            $pdf["personal_properties_r{$r}c3"] = self::formatMoney($row['acquisition_cost_amount'] ?? $row['acquisition_cost'] ?? '');
        }

        // liabilites
        $liabilities_total = 0.0;
        for ($i = 0; $i < 4; $i++) {
            $row = $liabilities[$i] ?? [];
            if ($row === []){
                break;
            }
            $r = $i + 1;
            // echo "hi from liabilties\n";
            $pdf["liabilities_r{$r}c1"] = $row['nature'] ?? '';
            $pdf["liabilities_r{$r}c2"] = $row['name_of_creditor'] ?? $row['creditor_name'] ?? '';
            $liabilities_total += (float)($row['outstanding_balance'] ?? 0.0);
            $pdf["liabilities_r{$r}c3"] = self::formatMoney($row['outstanding_balance'] ?? '');
        }

        // business interests
        for ($i = 0; $i < 3; $i++) {
            $row = $business_interests[$i] ?? [];
            if ($row === []){
                break;
            }
            $r = $i + 1;

            $pdf["business_r{$r}c1"] = $row['name_of_entity_or_business_enterprise'] ?? $row['entity_name'] ?? '';
            $pdf["business_r{$r}c2"] = $row['business_address'] ?? '';
            $pdf["business_r{$r}c3"] = $row['nature_of_business_interest_or_financial_connection'] ?? $row['nature_of_interest'] ?? '';
            $pdf["business_r{$r}c4"] = $row['date_of_acquisition'] ?? $row['date_acquired'] ?? '';
        }

        // subtotals and totals
        $pdf['real_properties_subtotal']     = self::formatMoney((string)$realPropts_total);
        $pdf['personal_properties_subtotal'] = self::formatMoney((string)$personalPropts_total);
        $pdf['total_assets']                 = self::formatMoney((string)($realPropts_total + $personalPropts_total));
        $pdf['total_liabilities']            = self::formatMoney((string)$liabilities_total);
    
        return $pdf;
    }
}